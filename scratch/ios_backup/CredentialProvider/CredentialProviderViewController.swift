import AuthenticationServices
import CryptoKit
import UIKit

class CredentialProviderViewController: ASCredentialProviderViewController {

    let suiteName = "group.com.drbarret.privatevault"
    let keyName   = "vault_autofill_data"

    // 原始解密資料
    private var allCredentials: [[String: Any]] = []
    
    // 自動偵測到的當前網域列表
    private var detectedDomains: [String] = []
    
    // 經自動比對匹配的帳密
    private var matchedCredentials: [[String: Any]] = []
    // 未比對匹配的其他帳密
    private var unmatchedCredentials: [[String: Any]] = []
    
    // 搜尋過濾後的資料
    private var filteredMatched: [[String: Any]] = []
    private var filteredUnmatched: [[String: Any]] = []

    // MARK: - Symmetric Key
    private var symmetricKey: SymmetricKey {
        let keyString = "com.drbarret.privatevault.autofill.secret.key.2026"
        let keyData = keyString.data(using: .utf8)!
        let hash = SHA256.hash(data: keyData)
        return SymmetricKey(data: hash)
    }

    // MARK: - UI Components

    // 實體自訂搜尋框，確保 100% 顯示在視窗頂部
    private lazy var searchBar: UISearchBar = {
        let sb = UISearchBar()
        sb.translatesAutoresizingMaskIntoConstraints = false
        sb.placeholder = "搜尋服務名稱、帳號、網址..."
        sb.delegate = self
        sb.backgroundImage = UIImage() // 移除預設背景邊框
        sb.barTintColor = .systemBackground
        sb.searchTextField.textColor = .label
        return sb
    }()

    private lazy var tableView: UITableView = {
        let tv = UITableView(frame: .zero, style: .insetGrouped)
        tv.translatesAutoresizingMaskIntoConstraints = false
        tv.delegate = self
        tv.dataSource = self
        tv.register(UITableViewCell.self, forCellReuseIdentifier: "Cell")
        return tv
    }()

    private lazy var titleLabel: UILabel = {
        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.text = "Cloud Password"
        label.font = .systemFont(ofSize: 18, weight: .bold)
        label.textColor = .label
        label.textAlignment = .center
        return label
    }()

    private lazy var cancelButton: UIButton = {
        let btn = UIButton(type: .system)
        btn.translatesAutoresizingMaskIntoConstraints = false
        btn.setTitle("取消", for: .normal)
        btn.titleLabel?.font = .systemFont(ofSize: 16)
        btn.setTitleColor(.systemRed, for: .normal)
        btn.addTarget(self, action: #selector(cancel), for: .touchUpInside)
        return btn
    }()

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        loadCredentials()
    }

    private func setupUI() {
        view.backgroundColor = .systemBackground

        view.addSubview(titleLabel)
        view.addSubview(cancelButton)
        view.addSubview(searchBar)
        view.addSubview(tableView)

        NSLayoutConstraint.activate([
            // 頂部導覽區
            titleLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            titleLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            
            cancelButton.centerYAnchor.constraint(equalTo: titleLabel.centerYAnchor),
            cancelButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),

            // 搜尋框固定在最頂部
            searchBar.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 8),
            searchBar.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 8),
            searchBar.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -8),

            // 表格接在搜尋框下方
            tableView.topAnchor.constraint(equalTo: searchBar.bottomAnchor),
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    @objc private func cancel() {
        extensionContext.cancelRequest(withError: NSError(
            domain: ASExtensionErrorDomain,
            code: ASExtensionError.userCanceled.rawValue
        ))
    }

    // MARK: - Data Loading & Matching

    private func loadCredentials() {
        guard let defaults = UserDefaults(suiteName: suiteName),
              let base64String = defaults.string(forKey: keyName),
              let encryptedData = Data(base64Encoded: base64String) else {
            return
        }

        do {
            let sealedBox = try AES.GCM.SealedBox(combined: encryptedData)
            let decryptedData = try AES.GCM.open(sealedBox, using: symmetricKey)
            if let json = try JSONSerialization.jsonObject(with: decryptedData) as? [[String: Any]] {
                allCredentials = json
            }
        } catch {
            print("[CloudPassword] Decryption failed: \(error)")
            allCredentials = []
        }
        
        // 載入資料後，立即執行一次過濾比對
        applyMatchingAndFiltering()
    }

    /// 從 URL 字串提取乾淨的 domain 進行比對
    private func extractDomain(from urlString: String) -> String? {
        var s = urlString.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty { return nil }
        if let range = s.range(of: "://") { s = String(s[range.upperBound...]) }
        if s.hasPrefix("www.") { s = String(s.dropFirst(4)) }
        if let slashIdx = s.firstIndex(of: "/") { s = String(s[..<slashIdx]) }
        if let queryIdx = s.firstIndex(of: "?") { s = String(s[..<queryIdx]) }
        if let colonIdx = s.firstIndex(of: ":") { s = String(s[..<colonIdx]) }
        return s.isEmpty ? nil : s
    }

    /// 根據偵測到的當前網域，將憑證分類為「匹配推薦」與「其他」
    private func applyMatchingAndFiltering() {
        matchedCredentials.removeAll()
        unmatchedCredentials.removeAll()

        for cred in allCredentials {
            let credUrl = ((cred["url"] as? String) ?? "").lowercased()
            let credService = ((cred["serviceName"] as? String) ?? "").lowercased()
            let credDomain = extractDomain(from: credUrl)

            var isMatch = false
            for domain in detectedDomains {
                // 1. 網域完全匹配或為子網域
                if let cd = credDomain, (cd == domain || cd.hasSuffix(".\(domain)") || domain.hasSuffix(".\(cd)")) {
                    isMatch = true
                    break
                }
                // 2. 服務名稱模糊包含
                if !credService.isEmpty && (domain.contains(credService) || credService.contains(domain)) {
                    isMatch = true
                    break
                }
            }

            if isMatch {
                matchedCredentials.append(cred)
            } else {
                unmatchedCredentials.append(cred)
            }
        }

        // 搜尋文字篩選
        let query = (searchBar.text ?? "").lowercased().trimmingCharacters(in: .whitespaces)
        if query.isEmpty {
            filteredMatched = matchedCredentials
            filteredUnmatched = unmatchedCredentials
        } else {
            filteredMatched = matchedCredentials.filter { credMatches(cred: $0, query: query) }
            filteredUnmatched = unmatchedCredentials.filter { credMatches(cred: $0, query: query) }
        }

        tableView.reloadData()
    }

    private func credMatches(cred: [String: Any], query: String) -> Bool {
        let service  = ((cred["serviceName"] as? String) ?? "").lowercased()
        let username = ((cred["username"] as? String) ?? "").lowercased()
        let url      = ((cred["url"] as? String) ?? "").lowercased()
        return service.contains(query) || username.contains(query) || url.contains(query)
    }

    // MARK: - ASCredentialProviderViewController Overrides

    override func prepareCredentialList(for serviceIdentifiers: [ASCredentialServiceIdentifier]) {
        // 系統會透過此處傳遞當前開啟的網站或 App Bundle ID
        detectedDomains = serviceIdentifiers.compactMap { identifier -> String? in
            switch identifier.type {
            case .URL:
                return self.extractDomain(from: identifier.identifier)
            case .domain:
                return identifier.identifier.lowercased()
            case .app:
                return nil // App Bundle ID 不作為網域比對
            @unknown default:
                return nil
            }
        }
        
        print("[CloudPassword] Detected service identifiers: \(detectedDomains)")
        applyMatchingAndFiltering()
    }

    override func provideCredentialWithoutUserInteraction(for credentialIdentity: ASPasswordCredentialIdentity) {
        loadCredentials()
        if let match = allCredentials.first(where: { ($0["id"] as? String) == credentialIdentity.recordIdentifier }),
           let user = match["username"] as? String,
           let pass = match["password"] as? String {
            extensionContext.completeRequest(withSelectedCredential: ASPasswordCredential(user: user, password: pass))
        } else {
            extensionContext.cancelRequest(withError: NSError(
                domain: ASExtensionErrorDomain,
                code: ASExtensionError.credentialIdentityNotFound.rawValue
            ))
        }
    }
}

// MARK: - UITableViewDataSource & Delegate

extension CredentialProviderViewController: UITableViewDataSource, UITableViewDelegate {

    func numberOfSections(in tableView: UITableView) -> Int {
        return 2 // Section 0: 推薦建議, Section 1: 所有帳密
    }

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        if section == 0 {
            return filteredMatched.isEmpty ? 1 : filteredMatched.count
        } else {
            return filteredUnmatched.isEmpty ? 1 : filteredUnmatched.count
        }
    }

    func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? {
        if section == 0 {
            let targetSite = detectedDomains.first ?? "當前網站"
            return "🎯 推薦建議 (\(targetSite))"
        } else {
            return "🗂️ 所有帳密 (\(allCredentials.count) 筆)"
        }
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = UITableViewCell(style: .subtitle, reuseIdentifier: "Cell")
        var config = cell.defaultContentConfiguration()

        if indexPath.section == 0 {
            if filteredMatched.isEmpty {
                config.text = "無推薦的帳戶"
                config.secondaryText = "請在下方列表查找或使用搜尋功能。"
                config.image = UIImage(systemName: "questionmark.circle")
                cell.selectionStyle = .none
                cell.contentConfiguration = config
                return cell
            }
            
            let cred = filteredMatched[indexPath.row]
            setupCellConfig(&config, with: cred)
        } else {
            if filteredUnmatched.isEmpty {
                config.text = "無相符的資料"
                config.image = UIImage(systemName: "folder.badge.minus")
                cell.selectionStyle = .none
                cell.contentConfiguration = config
                return cell
            }
            
            let cred = filteredUnmatched[indexPath.row]
            setupCellConfig(&config, with: cred)
        }

        cell.selectionStyle = .default
        cell.contentConfiguration = config
        return cell
    }

    private func setupCellConfig(_ config: inout UIListContentConfiguration, with cred: [String: Any]) {
        let type = (cred["type"] as? String) ?? "PASSWORD"

        if type == "CARD" {
            let brand = (cred["brand"] as? String) ?? "Card"
            let num = (cred["cardNumber"] as? String) ?? "****"
            let last4 = String(num.suffix(4))
            config.text = "\(brand) (**** \(last4))"
            config.secondaryText = (cred["serviceName"] as? String) ?? "Payment"
            config.image = UIImage(systemName: "creditcard.fill")
        } else {
            config.text = (cred["serviceName"] as? String) ?? "Unknown"
            config.secondaryText = cred["username"] as? String
            config.image = UIImage(systemName: "lock.fill")
        }
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)

        let selectedArray = indexPath.section == 0 ? filteredMatched : filteredUnmatched
        guard !selectedArray.isEmpty else { return }

        let cred = selectedArray[indexPath.row]
        let type = (cred["type"] as? String) ?? "PASSWORD"

        if type == "CARD" {
            let cardNum = (cred["cardNumber"] as? String) ?? ""
            let holder  = (cred["cardholderName"] as? String) ?? ""
            extensionContext.completeRequest(withSelectedCredential: ASPasswordCredential(user: holder, password: cardNum))
        } else if let user = cred["username"] as? String,
                  let pass = cred["password"] as? String {
            extensionContext.completeRequest(withSelectedCredential: ASPasswordCredential(user: user, password: pass))
        }
    }
}

// MARK: - UISearchBarDelegate

extension CredentialProviderViewController: UISearchBarDelegate {
    func searchBar(_ searchBar: UISearchBar, textDidChange searchText: String) {
        applyMatchingAndFiltering()
    }

    func searchBarSearchButtonClicked(_ searchBar: UISearchBar) {
        searchBar.resignFirstResponder()
    }
}
