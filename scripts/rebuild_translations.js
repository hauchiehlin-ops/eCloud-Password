const fs = require('fs');
const path = require('path');
const tsPath = path.resolve(__dirname, '../packages/core/src/i18n/translations.ts');
const jsPath = path.resolve(__dirname, 'temp_translations.js');

// We need to extract the object. Since we can't easily require a TS file without ts-node (which might not be configured for this),
// we will compile it first to JS.
const { execSync } = require('child_process');

try {
  // Compile specifically to CommonJS so we can require it
  execSync(`npx tsc ${tsPath} --target ES2018 --module commonjs --esModuleInterop --outDir ${__dirname}`);
} catch (e) {
  console.log("TypeScript compilation failed, but we'll try to proceed if JS was generated.");
}

const mod = require('./translations.js');
const { languages, translations } = mod;

const usedKeys = [
  'ALL', 'a', 'add_btn', 'add_cat', 'ai_title', 'all_cats', 'back_btn', 'bio_disabled_msg',
  'bio_enabled_msg', 'bio_err_t', 'bio_setup_req_d', 'bio_setup_req_t', 'biometric_btn',
  'biometric_fallback', 'biometric_prompt', 'btn_confirm_change', 'cancel', 'cancel_btn',
  'card_label', 'card_number_label', 'cat_data', 'cat_label', 'cat_name_placeholder',
  'cat_ungrouped', 'close_btn', 'cloud_expired_msg', 'cloud_logout_msg', 'cloud_logout_t',
  'confirm_key_placeholder', 'copied', 'decrypt_failed_label', 'delete_btn', 'delete_confirm_d',
  'delete_confirm_t', 'diag_active_after', 'diag_cloud_acc', 'diag_cloud_total', 'diag_conflicts',
  'diag_force_pull', 'diag_local_raw', 'diag_pushed_total', 'diag_run_repair', 'diag_run_reset',
  'diag_smart_hint', 'diag_status_ok', 'diag_sync_status', 'div', 'doc_manual_repair_d',
  'doc_privacy_content', 'doc_security_content', 'download_btn', 'dup_confirm_d', 'dup_confirm_t',
  'dup_congrats', 'dup_desc', 'dup_groups', 'dup_threshold', 'edit_btn', 'emergency_reset_d',
  'emergency_reset_t', 'err_cloud_unknown', 'err_csv_invalid', 'err_csv_large', 'err_fields_required',
  'err_master_key_corrupt', 'err_pdf_export', 'err_pwd_mismatch', 'err_pwd_short', 'err_sys_cat_delete',
  'err_vault_not_found', 'export_fail_t', 'feature_coming_soon', 'hide_pwd', 'import_err_t',
  'import_shared_optimized', 'import_success_d', 'issuing_bank', 'key_btn', 'label_cancel',
  'label_cardholder', 'label_cloud_sync', 'label_copy', 'label_danger_zone', 'label_delete',
  'label_hide', 'label_interchange', 'label_show', 'label_unknown', 'lang_btn', 'license_block_btn',
  'license_block_d', 'license_block_t', 'license_expired', 'license_trial', 'limit_reached_d',
  'limit_reached_t', 'logout_err_t', 'manage_cats', 'manual_import_d', 'manual_import_t',
  'manual_init_d', 'manual_init_t', 'manual_pro_d', 'manual_pro_t', 'manual_rescue_d',
  'manual_rescue_t', 'manual_sec_d', 'manual_sec_t', 'manual_sync_d', 'manual_sync_t',
  'manual_title', 'manual_trouble_d', 'manual_trouble_t', 'manual_vault_d', 'manual_vault_t',
  'master_key_placeholder', 'new_key_placeholder', 'notes_label', 'ok_btn', 'onboard_desc',
  'onboard_start', 'onboard_welcome', 'opt_bio', 'opt_change_key', 'opt_clear_filter',
  'opt_cloud_logout', 'opt_duplicates', 'opt_emergency_reset', 'opt_export', 'opt_import',
  'opt_lang', 'opt_lock', 'opt_logout', 'opt_pac', 'opt_privacy', 'opt_sync', 'opt_theme', 'opt_wipe_all',
  'opt_wipe_cloud', 'pac_active', 'pac_diag_t', 'pac_start', 'password_label', 'pull_empty_err',
  'pull_success_msg', 'pv_categories', 'pv_lang', 'pv_onboarding_done', 'pv_salt', 'pv_verify',
  'reset_btn', 'save_btn', 'score_title', 'search_placeholder', 'sec_arch_d1', 'sec_arch_d2',
  'sec_arch_d3', 'sec_arch_d4', 'sec_arch_t', 'sec_leaked', 'sec_reused', 'sec_weak',
  'service_label', 'service_name', 'setup_title', 'show_pwd', 'sort_name', 'sort_newest',
  'sort_oldest', 'status_auto_syncing', 'status_bio_cancelled', 'status_bio_first_unlock',
  'status_error', 'status_master_key_changed', 'status_premium_unlocked', 'status_reencrypting',
  'status_success', 'status_synced', 'status_syncing', 'status_vault_reset', 'sync_btn',
  'sync_err_t', 'tab_all', 'tab_card', 'tab_pwd', 'totp_label', 'trial_warning_d',
  'trial_warning_t', 'ungrouped', 'unlock_btn', 'unlock_title', 'upgrade_btn', 'upgrade_msg',
  'url_label', 'username_label', 'vault_empty', 'vault_entries', 'vault_title', 'web_auth_btn',
  'web_auth_err', 'web_auth_prompt', 'wipe_all_d', 'wipe_all_t', 'wipe_confirm', 'wipe_err_t',
  'wipe_success',
  // Dynamic ones
  'ai_weak_title', 'ai_weak_desc', 'ai_weak_title_fix',
  'ai_reused_title', 'ai_reused_desc', 'ai_reused_title_fix',
  'ai_2fa_title', 'ai_2fa_desc', 'ai_2fa_title_fix',
  'cat_work', 'cat_personal', 'cat_email', 'cat_shopping', 'cat_others',
  'diag_status_err', 'diag_center_t', 'pac_diagnose', 'pac_monitoring', 'pac_clear', 'pac_dismiss', 'pac_awaiting',
  'pac_active_label', 'pac_diag_start', 'label_default', 'opt_export_pdf', 'how_to_fix', 'import_fail_t', 'logged_out_t',
  'logout_msg', 'invalid_card_msg', 'passport_hint', 'status_clipboard_clear', 'err_no_items_verify', 'status_repair_success',
  'status_repair_fail', 'status_items_locked', 'label_len', 'pac_report',
  'guide_google_title', 'guide_google_desc', 'guide_autofill_title', 'guide_autofill_desc'
];

const newTranslations = {
  en: {
    doc_privacy_content: "Cloud Password operates on a strict 'Zero-Knowledge' architecture. Your master key, vault items, and decryption processes are managed entirely locally on your device. We do not collect, transmit, or store any personally identifiable information (PII) or plaintext credentials on our servers. This implementation is fully compliant with the iOS Data Protection guidelines and the Android Privacy Framework. During cloud synchronization, deleted items are securely tombstoned in the cloud and physically purged (Garbage Collected) from your local device upon successful sync, ensuring maximum data sovereignty and storage efficiency.",
    manual_sec_d: "Cloud Password uses military-grade AES-256-GCM encryption. Your Master Key is never stored and is derived locally using Argon2id, providing maximum resistance against brute-force attacks. Our active system monitoring prevents instance collisions and ensures derivation integrity.",
    manual_sync_d: "Zero-knowledge sync via Google Drive using a robust Last-Writer-Wins (LWW) conflict resolution algorithm. Only your device holds the keys; your data remains invisible to everyone else, including Google. Tombstoned deletions are safely propagated and automatically garbage collected from local storage after syncing.",
    manual_rescue_d: "If you encounter login issues after OS updates or device migrations, use 'Self-Healing Repair' in the Diagnostic Center to recalibrate your environment. Use 'Emergency Reset' only if you lose your Master Key and need to start over (local data will be wiped, but cloud data requires manual wiping).",
    doc_manual_repair_d: "If you experience login issues or environment shifts, use the Self-Healing Repair tool in the Diagnostic Center to dynamically recalibrate your key verification block.",
    guide_google_title: "Cloud Synchronization Setup",
    guide_google_desc: "To secure your vault, it is highly recommended to log in to your Google Account for zero-knowledge cloud backup and synchronization. Would you like to sign in now?",
    guide_autofill_title: "Enable Auto-Fill Service",
    guide_autofill_desc: "To enable automatic password filling, please configure the Auto-Fill settings:\n\n• iOS: Go to Settings > Passwords > Password Options, and select Cloud Password.\n• Android: Go to Settings > System > Languages & input > Autofill service, and select Cloud Password."
  },
  'zh-TW': {
    doc_privacy_content: "本應用程式在嚴格的「零知識」架構下運作。您的主金鑰、保險箱項目以及解密過程完全在您的裝置本地管理。我們不會在伺服器上收集、傳輸或儲存任何個人可識別資訊 (PII) 或明文憑證。此實作完全符合 iOS 資料保護指南與 Android 隱私框架。在雲端同步期間，刪除的項目會在雲端安全地標記為墓碑，並在同步成功後從您的本地裝置進行物理清除 (垃圾回收)，確保最大程度的資料主權與儲存效率。",
    manual_sec_d: "採用軍事級 AES-256-GCM 加密。您的主金鑰永遠不會被儲存，而是透過 Argon2id 演算法動態衍生，確保極高的抗暴力破解能力。我們的主動系統監控可防止實例碰撞並確保衍生金鑰的完整性。",
    manual_sync_d: "透過 Google Drive 進行零知識同步，採用強健的 LWW (最後寫入者獲勝) 衝突解決演算法。只有您的裝置擁有金鑰，連 Google 也無法窺探您的資料。墓碑刪除標記會安全地傳播，並在同步後自動從本地儲存中進行垃圾回收。",
    manual_rescue_d: "若在系統更新或更換裝置後無法登入，請使用診斷中心內的「自癒修復」來重新校準您的環境；若遺失主金鑰，才使用「緊急重設」清空本地數據重新開始（雲端數據需另外手動抹除）。",
    doc_manual_repair_d: "如果您遇到登入問題或環境偏移，請使用診斷中心中的「自癒修復」工具來動態重新校準您的金鑰驗證塊。",
    guide_google_title: "設定雲端同步",
    guide_google_desc: "為了確保您的保險箱資料安全，強烈建議您登入 Google 帳號以啟用零知識雲端備份與同步。是否現在進行登入？",
    guide_autofill_title: "啟用自動填入服務",
    guide_autofill_desc: "若要啟用密碼自動填入功能，請設定系統自動填入服務：\n\n• iOS：前往「設定」>「密碼」>「密碼選項」，並選取「Cloud Password」。\n• Android：前往「設定」>「系統」>「語言與輸入」>「自動填入服務」，並選取「Cloud Password」。"
  },
  'zh-CN': {
    doc_privacy_content: "本应用程序在严格的“零知识”架构下运作。您的主密钥、保险箱项目以及解密过程完全在您的设备本地管理。我们不会在服务器上收集、传输或存储任何个人可识别信息 (PII) 或明文凭证。此实现完全符合 iOS 数据保护指南与 Android 隐私框架。在云端同步期间，删除的项目会在云端安全地标记为墓碑，并在同步成功后从您的本地设备进行物理清除 (垃圾回收)，确保最大程度的数据主权与存储效率。",
    manual_sec_d: "采用军事级 AES-256-GCM 加密。您的主密钥永远不会被存储，而是通过 Argon2id 算法动态衍生，确保极高的抗暴力破解能力。我们的主动系统监控可防止实例碰撞并确保衍生密钥的完整性。",
    manual_sync_d: "通过 Google Drive 进行零知识同步，采用强健的 LWW (最后写入者获胜) 冲突解决算法。只有您的设备拥有密钥，连 Google 也无法窥探您的数据。墓碑删除标记会安全地传播，并在同步后自动从本地存储中进行垃圾回收。",
    manual_rescue_d: "若在系统更新或更换设备后无法登录，请使用诊断中心内的“自愈修复”来重新校准您的环境；若遗失主密钥，才使用“紧急重置”清空本地数据重新开始（云端数据需另外手动抹除）。",
    doc_manual_repair_d: "如果您遇到登录问题或环境偏移，请使用诊断中心中的“自愈修复”工具来动态重新校准您的密钥验证块。",
    guide_google_title: "设置云端同步",
    guide_google_desc: "为了确保您的保险箱数据安全，强烈建议您登录 Google 账号以启用零知识云端备份与同步。是否现在进行登录？",
    guide_autofill_title: "启用自动填充服务",
    guide_autofill_desc: "若要启用密码自动填充功能，请配置系统自动填充设置：\n\n• iOS：前往“设置” > “密码” > “密码选项”，然后选择“Cloud Password”。\n• Android：前往“设置” > “系统” > “语言和输入” > “自动填充服务”，然后选择“Cloud Password”。"
  },
  'ja': {
    doc_privacy_content: "このアプリケーションは厳格な「ゼロ知識」アーキテクチャで動作します。マスターキー、金庫の項目、復号化プロセスはすべてデバイスのローカルで管理されます。サーバー上で個人を特定できる情報（PII）や平文の資格情報を収集、送信、または保存することはありません。この実装は、iOSデータ保護ガイドラインとAndroidプライバシーフレームワークに完全に準拠しています。クラウド同期中、削除されたアイテムはクラウドで安全にトゥームストーンとしてマークされ、同期成功後にローカルデバイスから物理的に消去（ガベージコレクション）されるため、最大限のデータ主権とストレージ効率が保証されます。",
    manual_sec_d: "軍用グレードのAES-256-GCM暗号化を使用しています。マスターキーは保存されず、Argon2idを使用してローカルで派生し、ブルートフォース攻撃に対して最大限の耐性を提供します。アクティブなシステム監視により、インスタンスの衝突を防ぎ、派生の完全性を確保します。",
    manual_sync_d: "Googleドライブを介したゼロ知識同期。堅牢なLWW（Last-Writer-Wins）競合解決アルゴリズムを採用しています。デバイスのみがキーを保持し、Googleを含む第三者からはデータが見えません。トゥームストーンによる削除は安全に伝播され、同期後にローカルストレージから自動的にガベージコレクションされます。",
    manual_rescue_d: "OSのアップデートやデバイスの移行後にログインの問題が発生した場合は、診断センターの「自己修復修復」を使用して環境を再調整してください。マスターキーを紛失し、最初からやり直す必要がある場合にのみ「緊急リセット」を使用してください（ローカルデータは消去されますが、クラウドデータは手動で消去する必要があります）。",
    doc_manual_repair_d: "ログインの問題や環境のずれが発生した場合は、診断センターの自己修復ツールを使用して、キー検証ブロックを動的に再調整してください。",
    guide_google_title: "クラウド同期の設定",
    guide_google_desc: "保管庫の安全性を確保するため、ゼロ知識クラウドバックアップと同期を行うためのGoogleアカウントへのログインを強くお勧めします。今すぐサインインしますか？",
    guide_autofill_title: "自動入力サービスの有効化",
    guide_autofill_desc: "パスワードの自動入力を有効にするには、自動入力設定を行ってください：\n\n• iOS：「設定」>「パスワード」>「パスワードオプション」に進み、「Cloud Password」を選択します。\n• Android：「設定」>「システム」>「言語と入力」>「自動入力サービス」に進み、「Cloud Password」を選択します。"
  },
  'ko': {
    doc_privacy_content: "이 애플리케이션은 엄격한 '영지식(Zero-Knowledge)' 아키텍처로 작동합니다. 마스터 키, 금고 항목 및 복호화 프로세스는 전적으로 기기 내 로컬에서 관리됩니다. 당사는 서버에 개인 식별 정보(PII)나 일반 텍스트 자격 증명을 수집, 전송 또는 저장하지 않습니다. 이 구현은 iOS 데이터 보호 지침 및 Android 개인정보 보호 프레임워크를 완벽하게 준수합니다. 클라우드 동기화 중 삭제된 항목은 클라우드에 툼스톤(Tombstone)으로 안전하게 표시되며, 동기화가 성공하면 로컬 기기에서 물리적으로 삭제(가비지 컬렉션)되어 데이터 주권과 스토리지 효율성을 극대화합니다.",
    manual_sec_d: "군사 등급의 AES-256-GCM 암호화를 사용합니다. 마스터 키는 절대 저장되지 않으며 Argon2id를 사용하여 로컬에서 파생되어 무차별 대입 공격에 대한 최대의 저항력을 제공합니다. 능동적인 시스템 모니터링을 통해 인스턴스 충돌을 방지하고 파생 무결성을 보장합니다.",
    manual_sync_d: "강력한 LWW(Last-Writer-Wins) 충돌 해결 알고리즘을 사용한 Google 드라이브를 통한 영지식 동기화. 기기만 키를 보유하며 Google을 포함한 다른 모든 사람에게는 데이터가 표시되지 않습니다. 툼스톤 삭제는 안전하게 전파되며 동기화 후 로컬 저장소에서 자동으로 가비지 컬렉션됩니다.",
    manual_rescue_d: "OS 업데이트 또는 기기 마이그레이션 후 로그인 문제가 발생하는 경우 진단 센터의 '자가 복구(Self-Healing)'를 사용하여 환경을 재조정하세요. 마스터 키를 분실하여 처음부터 다시 시작해야 하는 경우에만 '긴급 초기화'를 사용하세요(로컬 데이터는 삭제되지만 클라우드 데이터는 수동으로 삭제해야 합니다).",
    doc_manual_repair_d: "로그인 문제 또는 환경 변형이 발생하는 경우 진단 센터의 자가 복구 도구를 사용하여 키 확인 블록을 동적으로 재조정하세요。",
    guide_google_title: "클라우드 동기화 설정",
    guide_google_desc: "보관함을 안전하게 보호하기 위해 영지식 클라우드 백업 및 동기화를 위한 Google 계정 로그인을 강력히 권장합니다. 지금 로그인하시겠습니까?",
    guide_autofill_title: "자동 채우기 서비스 활성화",
    guide_autofill_desc: "비밀번호 자동 채우기를 활성화하려면 자동 채우기 설정을 구성하십시오:\n\n• iOS: 설정 > 암호 > 암호 옵션으로 이동하여 Cloud Password를 선택합니다.\n• Android: 설정 > 시스템 > 언어 및 입력 > 자동 채우기 서비스로 이동하여 Cloud Password를 선택합니다."
  },
  'th': {
    doc_privacy_content: "แอปพลิเคชันนี้ทำงานบนสถาปัตยกรรม 'Zero-Knowledge' อย่างเข้มงวด รหัสผ่านหลัก รายการในตู้นิรภัย และกระบวนการถอดรหัสของคุณได้รับการจัดการภายในอุปกรณ์ของคุณทั้งหมด เราไม่รวบรวม ส่งผ่าน หรือจัดเก็บข้อมูลระบุตัวบุคคล (PII) หรือข้อมูลรับรองที่เป็นข้อความธรรมดาบนเซิร์ฟเวอร์ของเรา การดำเนินการนี้สอดคล้องกับหลักเกณฑ์การปกป้องข้อมูลของ iOS และกรอบความเป็นส่วนตัวของ Android อย่างสมบูรณ์ ระหว่างการซิงโครไนซ์บนคลาวด์ รายการที่ถูกลบจะถูกทำเครื่องหมายเป็น Tombstone อย่างปลอดภัยในคลาวด์ และจะถูกลบออกทางกายภาพ (Garbage Collected) จากอุปกรณ์ในพื้นที่ของคุณเมื่อซิงค์สำเร็จ เพื่อให้มั่นใจถึงอธิปไตยของข้อมูลและประสิทธิภาพการจัดเก็บสูงสุด",
    manual_sec_d: "ใช้การเข้ารหัส AES-256-GCM ระดับทหาร รหัสผ่านหลักของคุณจะไม่ถูกจัดเก็บไว้ แต่จะถูกสร้างขึ้นภายในเครื่องโดยใช้ Argon2id ซึ่งให้ความต้านทานสูงสุดต่อการโจมตีแบบ brute-force การตรวจสอบระบบแบบแอคทีฟของเราป้องกันการชนกันของอินสแตนซ์และทำให้มั่นใจถึงความสมบูรณ์ของการสร้างคีย์",
    manual_sync_d: "การซิงค์แบบ Zero-knowledge ผ่าน Google Drive โดยใช้อัลกอริทึมการแก้ไขข้อขัดแย้ง Last-Writer-Wins (LWW) ที่มีประสิทธิภาพ อุปกรณ์ของคุณเท่านั้นที่ถือกุญแจ; ข้อมูลของคุณจะไม่ปรากฏแก่บุคคลอื่น รวมถึง Google การลบแบบ Tombstone จะถูกเผยแพร่อย่างปลอดภัยและลบออกอัตโนมัติจากที่จัดเก็บข้อมูลในพื้นที่หลังจากการซิงค์",
    manual_rescue_d: "หากคุณพบปัญหาการเข้าสู่ระบบหลังจากอัปเดตระบบปฏิบัติการหรือการย้ายอุปกรณ์ ให้ใช้ 'Self-Healing Repair' ใน Diagnostic Center เพื่อปรับเทียบสภาพแวดล้อมของคุณใหม่ ใช้ 'Emergency Reset' เฉพาะเมื่อคุณทำ Master Key หายและต้องเริ่มต้นใหม่ (ข้อมูลในพื้นที่จะถูกลบ แต่ข้อมูลบนคลาวด์จะต้องลบด้วยตนเอง)",
    doc_manual_repair_d: "หากคุณประสบปัญหาการเข้าสู่ระบบหรือการเลื่อนสภาพแวดล้อม ให้ใช้เครื่องมือ Self-Healing Repair ใน Diagnostic Center เพื่อปรับทราบบล็อกการยืนยันรหัสผ่านของคุณแบบไดนามิก",
    guide_google_title: "ตั้งค่าการซิงโครไนซ์บนคลาวด์",
    guide_google_desc: "เพื่อความปลอดภัยของตู้นิรภัยของคุณ ขอแนะนำอย่างยิ่งให้เข้าสู่ระบบบัญชี Google ของคุณเพื่อสำรองข้อมูลและซิงโครไนซ์บนคลาวด์แบบ Zero-knowledge คุณต้องการลงชื่อเข้าใช้ตอนนี้หรือไม่?",
    guide_autofill_title: "เปิดใช้งานบริการป้อนอัตโนมัติ",
    guide_autofill_desc: "หากต้องการเปิดใช้งานการป้อนรหัสผ่านอัตโนมัติ โปรดตั้งค่าบริการป้อนอัตโนมัติ:\n\n• iOS: ไปที่ การตั้งค่า > รหัสผ่าน > ตัวเลือกรหัสผ่าน แล้วเลือก Cloud Password\n• Android: ไปที่ การตั้งค่า > ระบบ > ภาษาและการป้อนข้อมูล > บริการป้อนข้อมูลอัตโนมัติ แล้วเลือก Cloud Password"
  },
  'vi': {
    doc_privacy_content: "Ứng dụng này hoạt động dựa trên kiến trúc 'Zero-Knowledge' nghiêm ngặt. Khóa chính, các mục trong kho lưu trữ và quá trình giải mã của bạn được quản lý hoàn toàn cục bộ trên thiết bị của bạn. Chúng tôi không thu thập, truyền tải hoặc lưu trữ bất kỳ thông tin nhận dạng cá nhân (PII) hoặc thông tin xác thực dạng văn bản thuần túy nào trên máy chủ của chúng tôi. Việc triển khai này hoàn toàn tuân thủ các nguyên tắc Bảo vệ Dữ liệu của iOS và Khung Quyền riêng tư của Android. Trong quá trình đồng bộ hóa đám mây, các mục đã xóa được đánh dấu an toàn dưới dạng tombstone (bia mộ) trên đám mây và bị xóa vật lý (Thu gom rác) khỏi thiết bị cục bộ của bạn khi đồng bộ thành công, đảm bảo chủ quyền dữ liệu và hiệu quả lưu trữ tối đa.",
    manual_sec_d: "Cloud Password sử dụng mã hóa AES-256-GCM cấp độ quân sự. Khóa Chính của bạn không bao giờ được lưu trữ và được dẫn xuất cục bộ bằng Argon2id, mang lại khả năng chống lại các cuộc tấn công brute-force tối đa. Giám sát hệ thống chủ động của chúng tôi ngăn ngừa xung đột phiên bản và đảm bảo tính toàn vẹn của việc dẫn xuất.",
    manual_sync_d: "Đồng bộ hóa zero-knowledge qua Google Drive sử dụng thuật toán giải quyết xung đột Last-Writer-Wins (LWW) mạnh mẽ. Chỉ thiết bị của bạn giữ khóa; dữ liệu của bạn vẫn vô hình với tất cả mọi người, kể cả Google. Các mục bị xóa tombstone được truyền đi an toàn và tự động dọn dẹp khỏi bộ nhớ cục bộ sau khi đồng bộ.",
    manual_rescue_d: "Nếu bạn gặp sự cố đăng nhập sau khi cập nhật HĐH hoặc chuyển thiết bị, hãy sử dụng 'Self-Healing Repair' trong Trung tâm Chẩn đoán để hiệu chỉnh lại môi trường của bạn. Chỉ sử dụng 'Emergency Reset' nếu bạn làm mất Khóa Chính và cần bắt đầu lại (dữ liệu cục bộ sẽ bị xóa, nhưng dữ liệu đám mây yêu cầu phải xóa thủ công).",
    doc_manual_repair_d: "Nếu bạn gặp sự cố đăng nhập hoặc thay đổi môi trường, hãy sử dụng công cụ Self-Healing Repair trong Trung tâm Chẩn đoán để tự động hiệu chỉnh lại khối xác minh khóa của bạn.",
    guide_google_title: "Thiết lập đồng bộ hóa đám mây",
    guide_google_desc: "Để bảo mật kho lưu trữ của bạn, chúng tôi thực sự khuyên bạn nên đăng nhập vào Tài khoản Google của mình để sao lưu và đồng bộ hóa đám mây zero-knowledge. Bạn có muốn đăng nhập ngay bây giờ không?",
    guide_autofill_title: "Bật dịch vụ Tự động điền",
    guide_autofill_desc: "Để bật tính năng tự động điền mật khẩu, vui lòng định cấu hình cài đặt Tự động điền:\n\n• iOS: Đi tới Cài đặt > Mật khẩu > Tùy chọn mật khẩu và chọn Cloud Password.\n• Android: Đi tới Cài đặt > Hệ thống > Ngôn ngữ & nhập liệu > Dịch vụ tự động điền và chọn Cloud Password."
  },
  'ms': {
    doc_privacy_content: "Aplikasi ini beroperasi pada arkitek 'Sifar Pengetahuan' yang ketat. Kunci induk, item peti besi dan proses penyahsulitan anda diuruskan sepenuhnya secara setempat pada peranti anda. Kami tidak mengumpul, menghantar, atau menyimpan sebarang maklumat pengenalan peribadi (PII) atau kelayakan teks biasa pada pelayan kami. Pelaksanaan ini mematuhi sepenuhnya garis panduan Perlindungan Data iOS dan Rangka Kerja Privasi Android. Semasa penyegerakan awan, item yang dipadamkan akan ditandakan dengan selamat sebagai batu nisan (tombstone) di awan dan dipadamkan secara fizikal (Kutipan Sampah) daripada peranti setempat anda setelah penyegerakan berjaya, memastikan kedaulatan data dan kecekapan storan maksimum.",
    manual_sec_d: "Cloud Password menggunakan penyulitan AES-256-GCM gred tentera. Kunci Induk anda tidak pernah disimpan dan diterbitkan secara setempat menggunakan Argon2id, memberikan ketahanan maksimum terhadap serangan brute-force. Pemantauan sistem aktif kami menghalang perlanggaran keadaan dan memastikan integriti penerbitan.",
    manual_sync_d: "Penyegerakan sifar pengetahuan melalui Google Drive menggunakan algoritma penyelesaian konflik Last-Writer-Wins (LWW) yang mantap. Hanya peranti anda memegang kunci; data anda kekal tidak dapat dilihat oleh orang lain, termasuk Google. Pemadaman batu nisan disebarkan dengan selamat dan dibersihkan secara automatik dari storan tempatan selepas penyegerakan.",
    manual_rescue_d: "Jika anda mengalami isu log masuk selepas kemas kini OS atau pemindahan peranti, gunakan 'Pembaikan Penyembuhan Kendiri' di Pusat Diagnostik untuk menentukur semula persekitaran anda. Gunakan 'Tetapan Semula Kecemasan' hanya jika anda kehilangan Kunci Induk anda dan perlu bermula semula (data tempatan akan dipadam, tetapi data awan memerlukan pemadaman manual).",
    doc_manual_repair_d: "If you experience login issues or environment shifts, use the Self-Healing Repair tool in the Diagnostic Center to dynamically recalibrate your key verification block.",
    guide_google_title: "Sediakan Penyegerakan Awan",
    guide_google_desc: "Untuk memastikan keselamatan peti besi anda, anda sangat disyorkan untuk log masuk ke Akaun Google anda untuk sandaran dan penyegerakan awan sifar pengetahuan. Adakah anda ingin log masuk sekarang?",
    guide_autofill_title: "Dayakan Perkhidmatan Auto-Isi",
    guide_autofill_desc: "Untuk membolehkan pengisian kata laluan automatik, sila konfigurasikan tetapan Auto-Isi:\n\n• iOS: Pergi ke Tetapan > Kata Laluan > Pilihan Kata Laluan, dan pilih Cloud Password.\n• Android: Pergi ke Tetapan > Sistem > Bahasa & input > Perkhidmatan auto-isi, dan pilih Cloud Password."
  },
  'tl': {
    doc_privacy_content: "Gumagana ang application na ito sa isang mahigpit na arkitekturang 'Zero-Knowledge'. Ang iyong master key, mga item sa vault, at mga proseso sa pag-decrypt ay pinamamahalaan nang buo sa iyong device lang. Hindi kami kumokolekta, nagpapadala, o nag-iimbak ng anumang personal na nakikilalang impormasyon (PII) or plaintext na credentials sa aming mga server. Ang pagpapatupad na ito ay ganap na sumusunod sa mga panuntunan sa Proteksyon ng Data ng iOS at Android Privacy Framework. Sa panahon ng cloud synchronization, ang mga na-delete na item ay ligtas na tinatandaan bilang tombstone sa cloud at pisikal na inaalis (Garbage Collected) mula sa iyong lokal na device kapag naging matagumpay ang pag-sync, upang matiyak ang maximum na data sovereignty at storage efficiency.",
    manual_sec_d: "Gumagamit ang Cloud Password ng military-grade na AES-256-GCM encryption. Ang iyong Master Key ay hindi kailanman naka-store at lokal na idinidrive gamit ang Argon2id, na nagbibigay ng maximum na resistensya laban sa mga brute-force na atake. Ang aming aktibong pagsubaybay sa system ay pumipigil sa instance collisions at tinitiyak ang derivation integrity.",
    manual_sync_d: "Zero-knowledge na pag-sync sa pamamagitan ng Google Drive gamit ang isang matibay na Last-Writer-Wins (LWW) conflict resolution algorithm. Ang iyong device lang ang may hawak ng keys; hindi nakikita ang iyong data sa iba, kabilang ang Google. Ang mga tombstoned na deletion ay ligtas na pinalalaganap at awtomatikong gina-garbage collect mula sa lokal na storage pagkatapos ng pag-sync.",
    manual_rescue_d: "Kung makaranas ka ng mga isyu sa pag-log in pagkatapos ng mga OS update o device migration, gamitin ang 'Self-Healing Repair' sa Diagnostic Center para i-recalibrate ang iyong environment. Gamitin ang 'Emergency Reset' lamang kung mawala mo ang iyong Master Key at kailangang magsimula muli (mabubura ang lokal na data, ngunit kailangang manu-manong burahin ang cloud data).",
    doc_manual_repair_d: "Kung makaranas ka ng mga isyu sa pag-log in o pag-shift ng environment, gamitin the tool na Self-Healing Repair sa Diagnostic Center upang dinamikong i-recalibrate ang iyong key verification block.",
    guide_google_title: "I-setup ang Cloud Sync",
    guide_google_desc: "Upang ma-secure ang iyong vault, lubos na inirerekomenda na mag-log in sa iyong Google Account para sa zero-knowledge cloud backup at synchronization. Nais mo bang mag-sign in ngayon?",
    guide_autofill_title: "Paganahin ang Auto-Fill Service",
    guide_autofill_desc: "Upang paganahin ang awtomatikong pagpuno ng password, mangyaring i-configure ang mga setting ng Auto-Fill:\n\n• iOS: Pumunta sa Settings > Passwords > Password Options, at piliin ang Cloud Password.\n• Android: Pumunta sa Settings > System > Languages & input > Autofill service, at piliin ang Cloud Password."
  },
  'de': {
    doc_privacy_content: "Diese Anwendung arbeitet auf einer strikten 'Zero-Knowledge'-Architektur. Ihr Master-Key, Ihre Tresor-Einträge und Entschlüsselungsprozesse werden vollständig lokal auf Ihrem Gerät verwaltet. Wir sammeln, übertragen oder speichern keine personenbezogenen Daten (PII) oder Klartext-Anmeldeinformationen auf unseren Servern. Diese Implementierung entspricht vollständig den iOS-Datenschutzrichtlinien und dem Android-Datenschutzrahmen. Während der Cloud-Synchronisierung werden gelöschte Elemente sicher als Tombstone in der Cloud markiert und bei erfolgreicher Synchronisierung physisch von Ihrem lokalen Gerät gelöscht (Garbage Collected), um maximale Datensouveränität und Speichereffizienz zu gewährleisten.",
    manual_sec_d: "Cloud Password verwendet AES-256-GCM-Verschlüsselung auf Militärniveau. Ihr Master-Key wird niemals gespeichert und wird lokal mithilfe von Argon2id abgeleitet, was maximalen Widerstand gegen Brute-Force-Angriffe bietet. Unsere aktive Systemüberwachung verhindert Instanzkollisionen und gewährleistet die Integrität der Ableitung.",
    manual_sync_d: "Zero-Knowledge-Synchronisierung über Google Drive mit einem robusten Last-Writer-Wins (LWW)-Konfliktlösungsalgorithmus. Nur Ihr Gerät besitzt die Schlüssel; Ihre Daten bleiben für alle anderen, einschließlich Google, unsichtbar. Tombstone-Löschungen werden sicher verbreitet und nach der Synchronisierung automatisch aus dem lokalen Speicher bereinigt.",
    manual_rescue_d: "Wenn nach Betriebssystem-Updates oder Gerätemigrationen Anmeldeprobleme auftreten, verwenden Sie die 'Selbstheilungs-Reparatur' im Diagnosezentrum, um Ihre Umgebung neu zu kalibrieren. Verwenden Sie 'Notfall-Reset' nur, wenn Sie Ihren Master-Key verlieren und von vorne beginnen müssen (lokale Daten werden gelöscht, Cloud-Daten erfordern jedoch ein manuelles Löschen).",
    doc_manual_repair_d: "Wenn Sie Anmeldeprobleme oder Umgebungsverschiebungen feststellen, verwenden Sie das Selbstheilungs-Reparatur-Tool im Diagnosezentrum, um Ihren Schlüsselprüfungsblock dynamisch neu zu kalibrieren.",
    guide_google_title: "Cloud-Synchronisierung einrichten",
    guide_google_desc: "Um Ihren Tresor zu sichern, wird dringend empfohlen, sich bei Ihrem Google-Konto für die Zero-Knowledge-Cloud-Sicherung und -Synchronisierung anzumelden. Möchten Sie sich jetzt anmelden?",
    guide_autofill_title: "Automatisches Ausfüllen aktivieren",
    guide_autofill_desc: "Um das automatische Ausfüllen von Passwörtern zu aktivieren, konfigurieren Sie bitte die Einstellungen für das automatische Ausfüllen:\n\n• iOS: Gehen Sie zu Einstellungen > Passwörter > Passwortoptionen und wählen Sie Cloud Password.\n• Android: Gehen Sie zu Einstellungen > System > Sprachen & Eingabe > Auto-Ausfülldienst und wählen Sie Cloud Password."
  },
  'fr': {
    doc_privacy_content: "Cette application fonctionne sur une architecture stricte 'Zéro Connaissance'. Votre clé maître, les éléments de votre coffre-fort et les processus de déchiffrement sont entièrement gérés localement sur votre appareil. Nous ne collectons, ne transmettons ni ne stockons aucune information personnellement identifiable (PII) ni aucun identifiant en texte clair sur nos serveurs. Cette implémentation est entièrement conforme aux directives de protection des données d'iOS et au cadre de confidentialité d'Android. Lors de la synchronisation cloud, les éléments supprimés sont marqués en toute sécurité comme des pierres tombales (tombstones) dans le cloud et physiquement purgés (Garbage Collected) de votre appareil local une fois la synchronisation réussie, garantissant une souveraineté maximale des données et une efficacité de stockage.",
    manual_sec_d: "Cloud Password utilise un cryptage AES-256-GCM de niveau militaire. Votre clé maître n'est jamais stockée et est dérivée localement à l'aide d'Argon2id, offrant une résistance maximale contre les attaques par force brute. Notre surveillance active du système empêche les collisions d'instances et garantit l'intégrité de la dérivation.",
    manual_sync_d: "Synchronisation zéro connaissance via Google Drive à l'aide d'un algorithme robuste de résolution de conflits Last-Writer-Wins (LWW). Seul votre appareil détient les clés; vos données restent invisibles pour tout le monde, y compris Google. Les suppressions tombstone sont propagées en toute sécurité et automatiquement purgées du stockage local après la synchronisation.",
    manual_rescue_d: "Si vous rencontrez des problèmes de connexion après des mises à jour du système d'exploitation ou des migrations d'appareils, utilisez la 'Réparation Auto-cicatrisante' dans le Centre de diagnostic pour recalibrer votre environnement. Utilisez la 'Réinitialisation d'urgence' uniquement si vous perdez votre clé maître et devez recommencer (les données locales seront effacées, mais les données cloud nécessitent un effacement manuel).",
    doc_manual_repair_d: "Si vous rencontrez des problèmes de connexion ou des décalages d'environnement, utilisez l'outil de réparation auto-cicatrisante dans le Centre de diagnostic pour recalibrer dynamiquement votre bloc de vérification de clé.",
    guide_google_title: "Configurer la synchronisation Cloud",
    guide_google_desc: "Pour sécuriser votre coffre-fort, il est fortement recommandé de vous connecter à votre compte Google pour une sauvegarde et une synchronisation cloud zéro connaissance. Souhaitez-vous vous connecter maintenant ?",
    guide_autofill_title: "Activer le service de saisie automatique",
    guide_autofill_desc: "Pour activer la saisie automatique des mots de passe, veuillez configurer les paramètres de saisie automatique :\n\n• iOS : accédez à Réglages > Mots de passe > Options des mots de passe, puis sélectionnez Cloud Password.\n• Android : accédez à Paramètres > Système > Langues et saisie > Service de saisie automatique, puis sélectionnez Cloud Password."
  },
  'ru': {
    doc_privacy_content: "Это приложение работает на основе строгой архитектуры «Нулевого разглашения». Ваш главный ключ, элементы хранилища и процессы расшифровки управляются исключительно локально на вашем устройстве. Мы не собираем, не передаем и не храним личную идентифицируемую информацию (PII) или учетные данные в виде обычного текста на наших серверах. Эта реализация полностью соответствует рекомендациям по защите данных iOS и платформе конфиденциальности Android. Во время синхронизации с облаком удаленные элементы надежно помечаются как надгробия (tombstone) в облаке и физически удаляются (Garbage Collected) с вашего локального устройства после успешной синхронизации, обеспечивая максимальный суверенитет данных и эффективность хранения.",
    manual_sec_d: "Cloud Password использует шифрование AES-256-GCM военного уровня. Ваш главный ключ никогда не сохраняется и создается локально с использованием Argon2id, обеспечивая максимальную устойчивость к атакам перебором. Наш активный мониторинг системы предотвращает конфликты экземпляров и обеспечивает целостность генерации.",
    manual_sync_d: "Синхронизация с нулевым разглашением через Google Drive с использованием надежного алгоритма разрешения конфликтов Last-Writer-Wins (LWW). Только ваше устройство хранит ключи; ваши данные остаются невидимыми для всех остальных, включая Google. Удаления с надгробиями безопасно распространяются и автоматически удаляются из локального хранилища после синхронизации.",
    manual_rescue_d: "Если у вас возникнут проблемы со входом в систему после обновлений ОС или переноса устройства, используйте «Самовосстанавливающийся ремонт» в Диагностическом центре, чтобы откалибровать вашу среду. Используйте «Экстренный сброс» только в том случае, если вы потеряете свой главный ключ и вам нужно начать все сначала (локальные данные будут удалены, но данные облака нужно удалять вручную).",
    doc_manual_repair_d: "Если вы столкнулись с проблемами входа в систему или изменениями среды, используйте инструмент «Самовосстанавливающийся ремонт» в Диагностическом центре для динамической калибровки блока проверки ключа.",
    guide_google_title: "Настройка облачной синхронизации",
    guide_google_desc: "Для обеспечения безопасности вашего хранилища настоятельно рекомендуется войти в свою учетную запись Google для облачного резервного копирования и синхронизации с нулевым разглашением. Хотите войти сейчас?",
    guide_autofill_title: "Включить автозаполнение",
    guide_autofill_desc: "Чтобы включить автозаполнение паролей, настройте параметры автозаполнения:\n\n• iOS: перейдите в Настройки > Пароли > Параметры паролей и выберите Cloud Password.\n• Android: перейдите в Настройки > Система > Язык и ввод > Автозаполнение и выберите Cloud Password."
  }
};

let cleanedBaseEn = {};
const originalEn = translations['en'];
for (const key of Object.keys(originalEn)) {
    if (usedKeys.includes(key)) {
        cleanedBaseEn[key] = originalEn[key];
    }
}
// Apply overrides to base
Object.assign(cleanedBaseEn, newTranslations['en']);

const resultTranslations = {};
for (const [langCode, dict] of Object.entries(translations)) {
    let cleanedDict = {};
    for (const key of Object.keys(dict)) {
        if (usedKeys.includes(key) && cleanedBaseEn[key] !== dict[key]) {
            // Keep it if it's an override from baseEn
            cleanedDict[key] = dict[key];
        }
    }
    // Apply updates
    if (newTranslations[langCode]) {
        for (const [k, v] of Object.entries(newTranslations[langCode])) {
            cleanedDict[k] = v;
        }
    }
    resultTranslations[langCode] = cleanedDict;
}

// Generate the TypeScript file string
let outStr = `export const languages = [`;
for (let l of languages) {
    outStr += `\n  { code: "${l.code}", label: "${l.label}", flag: "${l.flag}" },`;
}
outStr += `\n];\n\n`;

outStr += `export type Language = 'en' | 'zh-TW' | 'zh-CN' | 'ja' | 'ko' | 'th' | 'vi' | 'ms' | 'tl' | 'de' | 'fr' | 'ru';\n\n`;

function objectToString(obj, isBase = false) {
    let s = `{\n`;
    if (!isBase) s += `  ...baseEn,\n`;
    for (const [k, v] of Object.entries(obj)) {
        s += `  '${k}': ${JSON.stringify(v)},\n`;
    }
    s += `}`;
    return s;
}

outStr += `const baseEn: any = ${objectToString(cleanedBaseEn, true)};\n\n`;
outStr += `export const translations: Record<Language, any> = {\n`;
for (const [langCode, dict] of Object.entries(resultTranslations)) {
    if (langCode === 'en') {
        outStr += `  'en': { ...baseEn },\n`;
    } else {
        outStr += `  '${langCode}': ${objectToString(dict, false)},\n`;
    }
}
outStr += `};\n`;

fs.writeFileSync(tsPath, outStr, 'utf8');
console.log("Successfully rebuilt translations.ts");
