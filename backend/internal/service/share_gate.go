package service

import (
	"strings"
	"unicode"
)

// NormalizeCustomerName 归一化客户姓名（去首尾空格、合并连续空白）。
func NormalizeCustomerName(name string) string {
	name = strings.TrimSpace(name)
	var b strings.Builder
	prevSpace := false
	for _, r := range name {
		if unicode.IsSpace(r) {
			if !prevSpace {
				b.WriteRune(' ')
				prevSpace = true
			}
			continue
		}
		prevSpace = false
		b.WriteRune(r)
	}
	return strings.TrimSpace(b.String())
}

// NormalizePhone 归一化手机号（仅保留数字）。
func NormalizePhone(phone string) string {
	var digits strings.Builder
	for _, r := range phone {
		if r >= '0' && r <= '9' {
			digits.WriteRune(r)
		}
	}
	return digits.String()
}

// MatchShareGate 校验分享门禁姓名与手机号是否与合同快照一致。
func MatchShareGate(contractName, contractPhone, inputName, inputPhone string) bool {
	wantName := NormalizeCustomerName(contractName)
	wantPhone := NormalizePhone(contractPhone)
	gotName := NormalizeCustomerName(inputName)
	gotPhone := NormalizePhone(inputPhone)
	if wantName == "" || wantPhone == "" {
		return false
	}
	if len(gotPhone) != 11 {
		return false
	}
	return wantName == gotName && wantPhone == gotPhone
}

// HasShareGateInfo 合同是否具备分享门禁所需的客户信息。
func HasShareGateInfo(customerName, customerPhone string) bool {
	return NormalizeCustomerName(customerName) != "" && NormalizePhone(customerPhone) != ""
}
