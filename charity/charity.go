package main

import (
    "encoding/json"
    "fmt"
    "time"
	"sort"

    "github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// =======================
// 数据结构定义
// =======================

// 用户名片
type UserProfile struct {
    Age     int    `json:"age"`
    Gender  string `json:"gender"`
    Contact string `json:"contact"` // 邮箱/电话
    Address string `json:"address"`
    Bio     string `json:"bio"` // 简介
}

// 用户（捐赠者或医院工作人员）
type User struct {
    ID             string      `json:"id"`
    Name           string      `json:"name"`
    Role           string      `json:"role"` // donor / hospital
    Profile        UserProfile `json:"profile"`
    PublicDonation bool        `json:"public_donation"` // 是否公开捐赠记录
    Donations      []string    `json:"donations"`       // 历史捐赠记录 ID
	TotalDonation  int64       `json:"total_donation"`  // 累计捐赠金额

}

// 募捐项目
type Campaign struct {
    ID          string   `json:"id"`
    Title       string   `json:"title"`
    Description string   `json:"description"`
    Target      int64    `json:"target"`
    Raised      int64    `json:"raised"`
    HospitalID  string   `json:"hospital_id"`
    ImageURL    string   `json:"image_url"` // 新增：图片链接
    Updates     []string `json:"updates"`
}

// 捐赠记录
type Donation struct {
    ID         string `json:"id"`
    CampaignID string `json:"campaign_id"`
    DonorID    string `json:"donor_id"`
    Amount     int64  `json:"amount"`
    Anonymous  bool   `json:"anonymous"`
    Ts         string `json:"timestamp"`
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
        Donations:      []string{},
		TotalDonation:  0,
    }
    b, err := json.Marshal(user)
    if err != nil {
        return err
    }
    return ctx.GetStub().PutState(key, b)
}

// 医院创建募捐项目
func (c *CharityCC) CreateCampaign(ctx contractapi.TransactionContextInterface,
    id, title, desc string, target int64, hospitalId, imageURL string) error {

    key := "camp:" + id
    exists, err := ctx.GetStub().GetState(key)
    if err != nil {
        return fmt.Errorf("failed to get campaign: %v", err)
    }
    if exists != nil {
        return fmt.Errorf("campaign %s already exists", id)
    }

    camp := Campaign{
        ID:          id,
        Title:       title,
        Description: desc,
        Target:      target,
        Raised:      0,
        HospitalID:  hospitalId,
        ImageURL:    imageURL,
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
func (c *CharityCC) Donate(ctx contractapi.TransactionContextInterface,
    donationId, campaignId, donorId string, amount int64, anonymous bool) error {

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

    // 更新项目进度
    camp.Raised += amount
    campBytes, err = json.Marshal(camp)
    if err != nil {
        return err
    }
    if err := ctx.GetStub().PutState("camp:"+campaignId, campBytes); err != nil {
        return err
    }

    // 更新用户历史捐赠记录
    userBytes, err := ctx.GetStub().GetState("user:" + donorId)
    if err != nil {
        return fmt.Errorf("failed to get donor: %v", err)
    }
    if userBytes == nil {
        return fmt.Errorf("donor %s not found", donorId)
    }
    var user User
    if err := json.Unmarshal(userBytes, &user); err != nil {
        return err
    }
    user.Donations = append(user.Donations, donationId)
	user.TotalDonation += amount
    newUserBytes, err := json.Marshal(user)
    if err != nil {
        return err
    }
    if err := ctx.GetStub().PutState("user:"+donorId, newUserBytes); err != nil {
        return err
    }

    return nil
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

// 查询某个用户的所有捐赠详情
func (c *CharityCC) QueryUserDonations(ctx contractapi.TransactionContextInterface, userId string) ([]*Donation, error) {
    userBytes, err := ctx.GetStub().GetState("user:" + userId)
    if err != nil {
        return nil, fmt.Errorf("failed to get user: %v", err)
    }
    if userBytes == nil {
        return nil, fmt.Errorf("user %s not found", userId)
    }

    var user User
    if err := json.Unmarshal(userBytes, &user); err != nil {
        return nil, err
    }

    var res []*Donation
    for _, donId := range user.Donations {
        dBytes, err := ctx.GetStub().GetState("don:" + donId)
        if err != nil {
            return nil, err
        }
        if dBytes == nil {
            continue
        }
        var d Donation
        if err := json.Unmarshal(dBytes, &d); err != nil {
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

// 根据 Campaign ID 查询项目
func (c *CharityCC) QueryCampaignByID(ctx contractapi.TransactionContextInterface, campaignId string) (*Campaign, error) {
    campBytes, err := ctx.GetStub().GetState("camp:" + campaignId)
    if err != nil {
        return nil, fmt.Errorf("failed to get campaign: %v", err)
    }
    if campBytes == nil {
        return nil, fmt.Errorf("campaign %s not found", campaignId)
    }

    var camp Campaign
    if err := json.Unmarshal(campBytes, &camp); err != nil {
        return nil, err
    }
    return &camp, nil
}

// 根据 User ID 查询用户（donor 或 hospital）
func (c *CharityCC) QueryUserByID(ctx contractapi.TransactionContextInterface, userId string) (*User, error) {
    userBytes, err := ctx.GetStub().GetState("user:" + userId)
    if err != nil {
        return nil, fmt.Errorf("failed to get user: %v", err)
    }
    if userBytes == nil {
        return nil, fmt.Errorf("user %s not found", userId)
    }

    var user User
    if err := json.Unmarshal(userBytes, &user); err != nil {
        return nil, err
    }
    return &user, nil
}

// 根据 Donation ID 查询捐赠记录
func (c *CharityCC) QueryDonationByID(ctx contractapi.TransactionContextInterface, donationId string) (*Donation, error) {
    dBytes, err := ctx.GetStub().GetState("don:" + donationId)
    if err != nil {
        return nil, fmt.Errorf("failed to get donation: %v", err)
    }
    if dBytes == nil {
        return nil, fmt.Errorf("donation %s not found", donationId)
    }

    var d Donation
    if err := json.Unmarshal(dBytes, &d); err != nil {
        return nil, err
    }
    return &d, nil
}

// 初始化数据
func (c *CharityCC) InitLedger(ctx contractapi.TransactionContextInterface) error {
    // 初始化用户
    users := map[string]User{
        "donor1": {
            ID:   "donor1",
            Name: "Alice",
            Role: "donor",
            Profile: UserProfile{
                Age:     30,
                Gender:  "female",
                Contact: "alice@example.com",
                Address: "City A",
                Bio:     "Enthusiastic donor who supports child healthcare.",
            },
            PublicDonation: true,
            Donations:      []string{},
            TotalDonation:  0,
        },
        "donor2": {
            ID:   "donor2",
            Name: "Bob",
            Role: "donor",
            Profile: UserProfile{
                Age:     28,
                Gender:  "male",
                Contact: "bob@example.com",
                Address: "City B",
                Bio:     "Believes in giving back to the community.",
            },
            PublicDonation: false,
            Donations:      []string{},
            TotalDonation:  0,
        },
        "hospital1": {
            ID:   "hospital1",
            Name: "Central Hospital",
            Role: "hospital",
            Profile: UserProfile{
                Contact: "hospital@example.com",
                Address: "City H",
                Bio:     "A trusted hospital dedicated to patient care.",
            },
            PublicDonation: true,
            Donations:      []string{},
            TotalDonation:  0,
        },
    }

    // 初始化募捐项目
    campaigns := map[string]Campaign{
        "camp1": {
            ID:          "camp1",
            Title:       "Help Patient X",
            Description: "Raising funds for urgent heart surgery.",
            Target:      20000,
            Raised:      0,
            HospitalID:  "hospital1",
            ImageURL:    "https://example.com/images/camp1.jpg",
            Updates:     []string{"Campaign created"},
        },
        "camp2": {
            ID:          "camp2",
            Title:       "Support Child Y",
            Description: "Funding cancer treatment for a 10-year-old child.",
            Target:      30000,
            Raised:      0,
            HospitalID:  "hospital1",
            ImageURL:    "https://example.com/images/camp2.jpg",
            Updates:     []string{"Campaign created"},
        },
    }

    // 初始化捐赠记录（直接在内存里更新 user 和 campaign）
    donations := []Donation{
        {
            ID:         "don1",
            CampaignID: "camp1",
            DonorID:    "donor1",
            Amount:     5000,
            Anonymous:  false,
            Ts:         time.Now().UTC().Format(time.RFC3339),
        },
        {
            ID:         "don2",
            CampaignID: "camp2",
            DonorID:    "donor2",
            Amount:     3000,
            Anonymous:  true,
            Ts:         time.Now().UTC().Format(time.RFC3339),
        },
    }

    // 应用捐赠到 campaign 和 user
    for _, d := range donations {
        // 更新项目
        camp := campaigns[d.CampaignID]
        camp.Raised += d.Amount
        camp.Updates = append(camp.Updates,
            fmt.Sprintf("Donation %s: %d received", d.ID, d.Amount))
        campaigns[d.CampaignID] = camp

        // 更新用户
        u := users[d.DonorID]
        u.Donations = append(u.Donations, d.ID)
        u.TotalDonation += d.Amount
        users[d.DonorID] = u
    }

    // === 最终写入 world state ===
    // 写用户
    for _, u := range users {
        key := "user:" + u.ID
        b, err := json.Marshal(u)
        if err != nil {
            return err
        }
        if err := ctx.GetStub().PutState(key, b); err != nil {
            return err
        }
    }

    // 写项目
    for _, camp := range campaigns {
        key := "camp:" + camp.ID
        b, err := json.Marshal(camp)
        if err != nil {
            return err
        }
        if err := ctx.GetStub().PutState(key, b); err != nil {
            return err
        }
    }

    // 写捐赠记录
    for _, d := range donations {
        key := "don:" + d.ID
        b, err := json.Marshal(d)
        if err != nil {
            return err
        }
        if err := ctx.GetStub().PutState(key, b); err != nil {
            return err
        }
    }

    return nil
}

func (c *CharityCC) QueryTopDonors(ctx contractapi.TransactionContextInterface) ([]map[string]interface{}, error) {
    it, err := ctx.GetStub().GetStateByRange("user:", "user;")
    if err != nil {
        return nil, err
    }
    defer it.Close()

    type donorInfo struct {
        ID     string
        Name   string
        Amount int64
    }

    var donors []donorInfo

    for it.HasNext() {
        kv, err := it.Next()
        if err != nil {
            return nil, err
        }
        var user User
        if err := json.Unmarshal(kv.Value, &user); err != nil {
            return nil, err
        }

        if user.Role != "donor" {
            continue
        }

        donors = append(donors, donorInfo{
            ID:     user.ID,
            Name:   user.Name,
            Amount: user.TotalDonation,
        })
    }

    sort.Slice(donors, func(i, j int) bool {
        return donors[i].Amount > donors[j].Amount
    })

    topN := 10
    if len(donors) < 10 {
        topN = len(donors)
    }

    var result []map[string]interface{}
    for i := 0; i < topN; i++ {
        result = append(result, map[string]interface{}{
            "id":     donors[i].ID,
            "name":   donors[i].Name,
            "amount": donors[i].Amount,
        })
    }

    return result, nil
}

