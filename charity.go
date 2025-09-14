package main

import (
    "encoding/json"
    "fmt"
    "time"

    "github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// =======================
// 数据结构定义
// =======================

// 用户名片
type UserProfile struct {
    Age       int    `json:"age"`
    Gender    string `json:"gender"`
    Contact   string `json:"contact"`   // 邮箱/电话
    Address   string `json:"address"`
    Bio       string `json:"bio"`       // 简介
}

// 患者名片
type PatientProfile struct {
    Age       int    `json:"age"`
    Gender    string `json:"gender"`
    Disease   string `json:"disease"`   // 病情
    Hospital  string `json:"hospital"`  // 所属医院
    Bio       string `json:"bio"`       // 补充说明
}

// 用户（捐赠者或医院工作人员）
type User struct {
    ID             string      `json:"id"`
    Name           string      `json:"name"`
    Role           string      `json:"role"` // donor / hospital / patient
    Profile        UserProfile `json:"profile"`
    PublicDonation bool        `json:"public_donation"` // 是否公开捐赠记录
}

// 募捐项目
type Campaign struct {
    ID          string   `json:"id"`
    Title       string   `json:"title"`
    Description string   `json:"description"`
    Target      int64    `json:"target"`
    Raised      int64    `json:"raised"`
    HospitalID  string   `json:"hospital_id"`
    Patient     PatientProfile `json:"patient_profile"` // 患者信息
    Updates     []string `json:"updates"`
}

// 捐赠记录
type Donation struct {
    ID        string `json:"id"`
    CampaignID string `json:"campaign_id"`
    DonorID   string `json:"donor_id"`
    Amount    int64  `json:"amount"`
    Anonymous bool   `json:"anonymous"`
    Ts        string `json:"timestamp"`
}

// =======================
// 合约定义
// =======================

type CharityCC struct {
    contractapi.Contract
}

// 注册用户
func (c *CharityCC) RegisterUser(ctx contractapi.TransactionContextInterface, id, name, role string, publicDonation bool, profileJSON string) error {
    key := "user:" + id
    exists, err := ctx.GetStub().GetState(key)
    if err != nil {
        return fmt.Errorf("failed to get user: %v", err)
    }
    if exists != nil {
        return fmt.Errorf("user %s already exists", id)
    }

    var profile UserProfile
    if err := json.Unmarshal([]byte(profileJSON), &profile); err != nil {
        return fmt.Errorf("invalid profile json: %v", err)
    }

    user := User{
        ID:             id,
        Name:           name,
        Role:           role,
        Profile:        profile,
        PublicDonation: publicDonation,
    }
    b, err := json.Marshal(user)
    if err != nil {
        return err
    }
    return ctx.GetStub().PutState(key, b)
}

// 医院创建募捐项目
func (c *CharityCC) CreateCampaign(ctx contractapi.TransactionContextInterface, id, title, desc string, target int64, hospitalId string, patientProfileJSON string) error {
    key := "camp:" + id
    exists, err := ctx.GetStub().GetState(key)
    if err != nil {
        return fmt.Errorf("failed to get campaign: %v", err)
    }
    if exists != nil {
        return fmt.Errorf("campaign %s already exists", id)
    }

    var patient PatientProfile
    if err := json.Unmarshal([]byte(patientProfileJSON), &patient); err != nil {
        return fmt.Errorf("invalid patient profile json: %v", err)
    }

    camp := Campaign{
        ID:          id,
        Title:       title,
        Description: desc,
        Target:      target,
        Raised:      0,
        HospitalID:  hospitalId,
        Patient:     patient,
        Updates:     []string{},
    }
    b, err := json.Marshal(camp)
    if err != nil {
        return err
    }
    return ctx.GetStub().PutState(key, b)
}

// 查询所有募捐项目
func (c *CharityCC) QueryAllCampaigns(ctx contractapi.TransactionContextInterface) ([]*Campaign, error) {
    it, err := ctx.GetStub().GetStateByRange("camp:", "camp;")
    if err != nil {
        return nil, err
    }
    defer it.Close()

    var res []*Campaign
    for it.HasNext() {
        kv, err := it.Next()
        if err != nil {
            return nil, err
        }
        var camp Campaign
        if err := json.Unmarshal(kv.Value, &camp); err != nil {
            return nil, err
        }
        res = append(res, &camp)
    }
    return res, nil
}

// 捐赠
func (c *CharityCC) Donate(ctx contractapi.TransactionContextInterface, donationId, campaignId, donorId string, amount int64, anonymous bool) error {
    campBytes, err := ctx.GetStub().GetState("camp:" + campaignId)
    if err != nil {
        return fmt.Errorf("failed to get campaign: %v", err)
    }
    if campBytes == nil {
        return fmt.Errorf("campaign %s not found", campaignId)
    }

    var camp Campaign
    if err := json.Unmarshal(campBytes, &camp); err != nil {
        return err
    }

    // 使用区块时间戳而不是容器时间
    ts, err := ctx.GetStub().GetTxTimestamp()
    if err != nil {
        return fmt.Errorf("failed to get tx timestamp: %v", err)
    }
    donation := Donation{
        ID:         donationId,
        CampaignID: campaignId,
        DonorID:    donorId,
        Amount:     amount,
        Anonymous:  anonymous,
        Ts:         time.Unix(ts.Seconds, int64(ts.Nanos)).UTC().Format(time.RFC3339),
    }

    dKey := "don:" + donationId
    dBytes, err := json.Marshal(donation)
    if err != nil {
        return err
    }
    if err := ctx.GetStub().PutState(dKey, dBytes); err != nil {
        return err
    }

    // 更新筹款进度
    camp.Raised += amount
    campBytes, err = json.Marshal(camp)
    if err != nil {
        return err
    }
    return ctx.GetStub().PutState("camp:"+campaignId, campBytes)
}

// 查询所有捐款
func (c *CharityCC) QueryAllDonations(ctx contractapi.TransactionContextInterface) ([]*Donation, error) {
    it, err := ctx.GetStub().GetStateByRange("don:", "don;")
    if err != nil {
        return nil, err
    }
    defer it.Close()

    var res []*Donation
    for it.HasNext() {
        kv, err := it.Next()
        if err != nil {
            return nil, err
        }
        var d Donation
        if err := json.Unmarshal(kv.Value, &d); err != nil {
            return nil, err
        }
        res = append(res, &d)
    }
    return res, nil
}

// 医院更新病情
func (c *CharityCC) UpdateCondition(ctx contractapi.TransactionContextInterface, campaignId, updateText string) error {
    campBytes, err := ctx.GetStub().GetState("camp:" + campaignId)
    if err != nil {
        return fmt.Errorf("failed to get campaign: %v", err)
    }
    if campBytes == nil {
        return fmt.Errorf("campaign %s not found", campaignId)
    }
    var camp Campaign
    if err := json.Unmarshal(campBytes, &camp); err != nil {
        return err
    }
    camp.Updates = append(camp.Updates, updateText)

    b, err := json.Marshal(camp)
    if err != nil {
        return err
    }
    return ctx.GetStub().PutState("camp:"+campaignId, b)
}

// =======================
// 主函数
// =======================
func main() {
    cc, err := contractapi.NewChaincode(new(CharityCC))
    if err != nil {
        panic(err.Error())
    }
    if err := cc.Start(); err != nil {
        panic(err.Error())
    }
}
