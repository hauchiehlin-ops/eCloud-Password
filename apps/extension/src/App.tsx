import React, { useState, useEffect, useMemo, useRef } from 'react';
import { VaultManager, SyncEngine, PasswordGenerator, translations, Language, CSVProcessor, BiometricHelper, languages, Watchtower, Icons, TOTPHelper, AIGuard, PrivacyAuditor, LicenseManager } from '@private-vault/core';
import { WebCryptoProvider } from './providers/WebCryptoProvider';
import { WebStorageProvider } from './providers/WebStorageProvider';
import { GoogleDriveSyncProvider } from './providers/GoogleDriveSyncProvider';

const vaultManager = new VaultManager(new WebCryptoProvider(), new WebStorageProvider());
const cloudSyncProvider = new GoogleDriveSyncProvider();
const syncEngine = new SyncEngine(vaultManager, cloudSyncProvider);

type AppState = 'LOADING' | 'SETUP' | 'LOCKED' | 'UNLOCKED';
type ViewMode = 'LIST' | 'ADD' | 'EDIT' | 'SETTINGS' | 'LANG_PICKER' | 'DATA_MANAGE' | 'CHANGE_KEY' | 'DUPLICATES';

const AUTO_LOCK_MS = 5 * 60 * 1000;

export default function App() {
  const [appState, setAppState] = useState<AppState>('LOADING');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('LIST');
  const [items, setItems] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [lang, setLang] = useState<Language>('zh-TW');
  const [sortBy, setSortBy] = useState<'name' | 'updated'>('name');
  const [syncStatus, setSyncStatus] = useState('');
  const [isCloudAuthed, setIsCloudAuthed] = useState(false);

  const [newService, setNewService] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newTotp, setNewTotp] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isNewPasswordVisible, setIsNewPasswordVisible] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [breachedIds, setBreachedIds] = useState<Record<string, number>>({});

  const [currentTabHostname, setCurrentTabHostname] = useState('');
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [genConfig, setGenConfig] = useState({ upper: true, lower: true, number: true, special: true, length: 16 });
  const [similarityThreshold, setSimilarityThreshold] = useState(60);

  // 1. License Integration (Chrome Extension is completely Free & Unlimited)
  const activeLicense = useMemo(() => LicenseManager.getStatus('lifetime', Date.now(), items.length), [items.length]);

  const t = (key: string) => (translations[lang] && translations[lang][key]) || (translations['en'] && translations['en'][key]) || key;

  useEffect(() => {
    BiometricHelper.isSupported().then(setBiometricSupported);
    setBiometricEnabled(!!localStorage.getItem('pv_bio_id'));
    const salt = localStorage.getItem('pv_salt');
    const savedLang = localStorage.getItem('pv_lang') as Language;
    if (savedLang && translations[savedLang]) setLang(savedLang);
    setAppState(salt ? 'LOCKED' : 'SETUP');

    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.url) {
          try { setCurrentTabHostname(new URL(tabs[0].url).hostname.replace('www.', '')); } catch (e) {}
        }
      });
    }
  }, []);

  const loadItems = async () => {
    try {
      const result = await vaultManager.getDecryptedItems();
      const loadedItems = Array.isArray(result.items) ? result.items : [];
      setItems(loadedItems);

      // Async breach check
      loadedItems.forEach(async (item: any) => {
        if (!item.secretPayload.password) return;
        const { isPwned, count } = await Watchtower.checkBreach(item.secretPayload.password);
        if (isPwned) {
          setBreachedIds(prev => ({ ...prev, [item.id]: count }));
        }
      });
    } catch (err) { setItems([]); }
  };

  useEffect(() => { if (appState === 'UNLOCKED') loadItems(); }, [appState]);

  const sortedAndFilteredItems = useMemo(() => {
    const query = (searchQuery || "").toLowerCase();
    const domain = (currentTabHostname || "").toLowerCase();
    return [...items]
      .sort((a, b) => {
        const aMatches = domain && a.serviceName?.toLowerCase().includes(domain);
        const bMatches = domain && b.serviceName?.toLowerCase().includes(domain);
        if (aMatches && !bMatches) return -1;
        if (!aMatches && bMatches) return 1;
        return 0;
      })
      .filter(i => (i.serviceName?.toLowerCase().includes(query) || i.username?.toLowerCase().includes(query)))
      .sort((a, b) => {
        if (sortBy === 'name') return (a.serviceName || "").localeCompare(b.serviceName || "");
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
  }, [items, searchQuery, sortBy, currentTabHostname]);

  const handleSetup = async () => {
    if (password !== confirmPassword) return setStatusMsg(t('status_error'));
    try {
      const { salt } = await new WebCryptoProvider().deriveKey(password);
      localStorage.setItem('pv_salt', salt);
      await vaultManager.unlockVault(password, salt);
      // Sync to background for auto-fill
      chrome.runtime.sendMessage({ type: 'PV_SYNC_SESSION', key: (vaultManager as any).sessionKey });
      setAppState('UNLOCKED');
    } catch (err: any) { setStatusMsg(err.message); }
  };

  const handleUnlock = async () => {
    try {
      const salt = localStorage.getItem('pv_salt')!;
      await vaultManager.unlockVault(password, salt);
      // Sync to background for auto-fill
      chrome.runtime.sendMessage({ type: 'PV_SYNC_SESSION', key: (vaultManager as any).sessionKey });
      setAppState('UNLOCKED');
    } catch (err: any) { setStatusMsg(err.message); }
  };

  const handleAddEntry = async () => {
    if (!newService || !newUsername || !newPassword) return setStatusMsg(t('status_error'));
    
    // [PAYWALL CHECK]
    if (!LicenseManager.canAddMore(items.length, activeLicense)) {
      alert(t('limit_reached_d') || 'Limit reached');
      return;
    }

    await vaultManager.addEntry(newService, newUsername, { password: newPassword, totpSecret: newTotp });
    clearAndBack();
  };

  const handleUpdateEntry = async () => {
    if (!editingId) return;
    await vaultManager.updateEntry(editingId, newService, newUsername, { password: newPassword, totpSecret: newTotp });
    clearAndBack();
  };

  const deleteEntry = async (id: string) => {
    if (window.confirm(t('label_delete') + "?")) {
      await vaultManager.deleteEntry(id);
      loadItems();
    }
  };

  const clearAndBack = () => {
    setNewService(''); setNewUsername(''); setNewPassword(''); setNewTotp('');
    setEditingId(null); setViewMode('LIST'); loadItems();
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setStatusMsg(`${label} ${t('copied')}`);
    setTimeout(() => setStatusMsg(''), 2000);
  };

  const handleExportCSV = async () => {
    try {
      const result = await vaultManager.getDecryptedItems();
      const csvContent = CSVProcessor.exportToCSV(result.items);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'vault_export.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setStatusMsg(err.message);
    }
  };

  const checkCloudAuth = async () => {
    try {
      const authed = await cloudSyncProvider.isAuthenticated();
      setIsCloudAuthed(authed);
    } catch {
      setIsCloudAuthed(false);
    }
  };

  useEffect(() => {
    if (appState === 'UNLOCKED') {
      checkCloudAuth();
    }
  }, [appState, viewMode]);

  const handleSync = async () => {
    setSyncStatus(t('status_syncing'));
    setStatusMsg('');
    console.log('🔄 [Sync] Starting cloud synchronization via SyncEngine...');
    try {
      const result = await syncEngine.sync(password, [], [], 0, true);
      console.log('✅ [Sync] Cloud synchronization completed successfully!', result);
      setSyncStatus(t('status_synced'));
      
      const { items: decrypted, failedCount } = await vaultManager.getDecryptedItems();
      setItems(decrypted);
      
      let diagMsg = t('ext_sync_success').replace('{count}', result.remoteItemCount.toString());
      if (result.remoteItemCount > 0) {
        diagMsg += t('ext_decrypt_success').replace('{count}', decrypted.length.toString());
        if (failedCount > 0) {
          diagMsg += t('ext_decrypt_failed').replace('{count}', failedCount.toString());
        } else {
          diagMsg += t('ext_all_restored');
        }
      } else {
        diagMsg += t('ext_cloud_empty');
      }
      
      setStatusMsg(diagMsg);
      await checkCloudAuth();
    } catch (err: any) {
      console.error('❌ [Sync] Cloud synchronization failed:', err);
      setSyncStatus('Error');
      setStatusMsg(`${t('sync_err_t')}: ${err.message || err}`);
    }
  };

  const handleCloudLogout = async () => {
    console.log('🔌 [Sync] Shutting down cloud sync session...');
    try {
      await cloudSyncProvider.logout();
      setIsCloudAuthed(false);
      console.log('✅ [Sync] Cloud sync session closed.');
      setStatusMsg(t('cloud_logout_msg'));
      setTimeout(() => setStatusMsg(''), 3000);
    } catch (err: any) {
      console.error('❌ [Sync] Cloud logout failed:', err);
      setStatusMsg(err.message);
    }
  };

  if (appState === 'LOADING') return <div className="vault-container"><p>Initializing...</p></div>;

  return (
    <div className="vault-container">
      <header className="vault-header">
        <h1>{t('vault_title')}</h1>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {viewMode === 'LIST' ? (
            <button className="industrial-btn-small" style={{ fontSize: 18 }} onClick={() => setViewMode('SETTINGS')}>⚙️</button>
          ) : (
            <button className="industrial-btn-small" onClick={() => setViewMode('LIST')}>← {t('back_btn')}</button>
          )}
          <div className={`status-indicator ${appState === 'UNLOCKED' ? 'unlocked' : 'locked'}`} style={{ marginLeft: 12 }} />
        </div>
      </header>

      <main className="vault-body">
        {appState === 'SETUP' && (
          <div className="login-panel">
            <p className="blueprint-text">{t('setup_title')}</p>
            <input type="password" className="industrial-input" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('unlock_title')} />
            <input type="password" className="industrial-input" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder={t('setup_title')} />
            <button className="industrial-btn" onClick={handleSetup}>{t('save_btn')}</button>
            <p className="status-text">{statusMsg}</p>
          </div>
        )}

        {appState === 'LOCKED' && (
          <div className="login-panel">
            <p className="blueprint-text">{t('unlock_title')}</p>
            <input type="password" className="industrial-input" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleUnlock()} placeholder="••••••••" />
            <button className="industrial-btn" onClick={handleUnlock}>{t('unlock_btn')}</button>
            <p className="status-text">{statusMsg}</p>
          </div>
        )}

        {appState === 'UNLOCKED' && viewMode === 'LIST' && (
          <div className="vault-content">
            {/* PRO BANNER */}
            {activeLicense.tier === 'expired' && (
              <div style={{ background: 'rgba(255,193,7,0.1)', padding: 10, borderRadius: 8, marginBottom: 12, border: '1px solid var(--industrial-yellow)' }}>
                <p style={{ margin:0, fontSize: 10, color: 'var(--industrial-yellow)', fontWeight: 'bold' }}>⚠️ {t('limit_reached_t')}</p>
                <p style={{ margin:0, fontSize: 9, color: 'var(--text-dim)' }}>{t('limit_reached_d')}</p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p className="blueprint-text" style={{margin:0}}>{t('vault_entries')} ({items.length})</p>
              <button className="industrial-btn-small" onClick={() => setViewMode('ADD')}>{t('add_btn')}</button>
            </div>
            <input type="text" className="industrial-input search-box" placeholder={t('search_placeholder')} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            <div className="items-list">
              {sortedAndFilteredItems.length === 0 ? (
                <div style={{ textAlign: 'center', marginTop: 40, opacity: 0.5 }}><p>{t('vault_empty')}</p></div>
              ) : (
                sortedAndFilteredItems.map(item => {
                  const isMatch = currentTabHostname && item.serviceName?.toLowerCase().includes(currentTabHostname);
                  return (
                    <div key={item.id} className="vault-item-card" style={isMatch ? { borderColor: 'var(--industrial-yellow)' } : {}}>
                      <div className="vault-item-header">
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <img 
                            src={`https://www.google.com/s2/favicons?sz=64&domain=${item.serviceName.toLowerCase()}.com`} 
                            style={{ width: 16, height: 16, marginRight: 8, borderRadius: 2 }}
                            alt=""
                          />
                          <span className="vault-item-name">{item.serviceName}</span>
                          {breachedIds[item.id] && (
                            <span style={{ marginLeft: 8, fontSize: 8, color: '#f44336', border: '1px solid #f44336', padding: '1px 4px', borderRadius: 4, fontWeight: 'bold' }}>PWNED</span>
                          )}
                        </div>
                        <div className="vault-item-actions">
                          <button className="action-btn" onClick={() => setEditingId(item.id) || setViewMode('EDIT') || setNewService(item.serviceName) || setNewUsername(item.username) || setNewPassword(item.secretPayload.password)}>✏️</button>
                          <button className="action-btn delete" onClick={() => deleteEntry(item.id)}>🗑️</button>
                        </div>
                      </div>
                      <div className="vault-item-user">
                        <span>{item.username}</span>
                        <button className="copy-btn" onClick={() => copy(item.username, t('username_label'))}>{t('label_copy')}</button>
                      </div>
                      <div className="item-secret" style={{ marginTop: 8 }}>
                        <span>{visiblePasswords[item.id] ? item.secretPayload.password : "••••••••"}</span>
                        <div>
                          <button className="action-btn" onClick={() => setVisiblePasswords(p => ({...p, [item.id]: !p[item.id]}))}>
                            {visiblePasswords[item.id] ? t('label_hide') : t('label_show')}
                          </button>
                          <button className="action-btn copy-btn" onClick={() => copy(item.secretPayload.password, t('password_label'))}>{t('label_copy')}</button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {appState === 'UNLOCKED' && (viewMode === 'ADD' || viewMode === 'EDIT') && (
          <div className="vault-content">
            <p className="blueprint-text">{viewMode === 'ADD' ? t('add_btn') : t('edit_btn')}</p>
            <input type="text" className="industrial-input" placeholder={t('service_label')} value={newService} onChange={e => setNewService(e.target.value)} />
            <input type="text" className="industrial-input" placeholder={t('username_label')} value={newUsername} onChange={e => setNewUsername(e.target.value)} />
            <input type="password" className="industrial-input" placeholder={t('password_label')} value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            <button className="industrial-btn" onClick={viewMode === 'ADD' ? handleAddEntry : handleUpdateEntry}>{t('save_btn')}</button>
            <button className="industrial-btn" style={{marginTop: 8, backgroundColor: '#333'}} onClick={() => setViewMode('LIST')}>{t('back_btn')}</button>
          </div>
        )}

        {appState === 'UNLOCKED' && viewMode === 'SETTINGS' && (
          <div className="vault-content settings-view">
             <div className="setting-row" onClick={() => setViewMode('LANG_PICKER')}><span>{t('opt_lang')}</span><span>{lang.toUpperCase()} ❯</span></div>
             <div className="setting-row" onClick={() => setViewMode('DATA_MANAGE')}><span>{t('cat_data')}</span><span>❯</span></div>
             <div className="setting-row" onClick={handleSync}>
               <span>{t('opt_sync')}</span>
               <span style={{ color: syncStatus ? 'var(--industrial-yellow)' : 'var(--text-dim)' }}>
                 {syncStatus || (isCloudAuthed ? t('status_synced') : '❯')}
               </span>
             </div>
             {isCloudAuthed && (
               <div className="setting-row" onClick={handleCloudLogout}>
                 <span>{t('opt_cloud_logout')}</span>
                 <span style={{ color: 'red' }}>✕</span>
               </div>
             )}
             <div className="setting-row" onClick={() => setViewMode('DUPLICATES')}>
               <span>🤖 {t('opt_duplicates') || 'AI 重複整理'}</span>
               <span style={{ color: 'var(--industrial-yellow)' }}>❯</span>
             </div>
             <div className="setting-row" onClick={() => { setAppState('LOCKED'); setPassword(''); }}><span>{t('opt_lock')}</span><span style={{color:'red'}}>{t('opt_lock').toUpperCase()}</span></div>
             
             {statusMsg && (
               <p className="status-text" style={{ textAlign: 'center', color: 'var(--industrial-yellow)', marginTop: 12, padding: '4px 8px', border: '1px solid rgba(255, 193, 7, 0.2)', borderRadius: 4, background: 'rgba(255, 193, 7, 0.05)', fontSize: 10, wordBreak: 'break-all' }}>
                 {statusMsg}
               </p>
             )}

             {/* [PRO STATUS] */}
             <div style={{ marginTop: 20, padding: 15, background: '#000', borderRadius: 8, border: '1px solid #333' }}>
               <p style={{ color: '#0f0', fontSize: 10, margin: 0 }}>[STATUS: FREE (EXTENSION)]</p>
               <p style={{ color: '#0f0', fontSize: 10, margin: '4px 0 0' }}>Items: {items.length} (UNLIMITED)</p>
             </div>
          </div>
        )}

        {appState === 'UNLOCKED' && viewMode === 'LANG_PICKER' && (
          <div className="vault-content settings-view">
            <p className="blueprint-text">{t('opt_lang')}</p>
            {languages.map(l => (
              <div key={l.code} className="setting-row" onClick={() => { 
                setLang(l.code as Language); 
                localStorage.setItem('pv_lang', l.code);
                setViewMode('SETTINGS'); 
              }}>
                <span>{l.flag} {l.label}</span>
                {lang === l.code && <span style={{color:'var(--industrial-yellow)'}}>✓</span>}
              </div>
            ))}
          </div>
        )}

        {appState === 'UNLOCKED' && viewMode === 'DATA_MANAGE' && (
          <div className="vault-content settings-view">
            <p className="blueprint-text">{t('cat_data')}</p>
            <div className="setting-row" onClick={handleExportCSV}><span>{t('opt_export')}</span><span>📤</span></div>
            <label className="setting-row"><span>{t('opt_import')}</span><span>📥<input type="file" accept=".csv" style={{display:'none'}} onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = async (ev) => {
                  const importedItems = CSVProcessor.parseCSV(ev.target?.result as string);
                  let addedCount = 0;
                  const allowedItems = [];
                  for (const item of importedItems) {
                    if (!LicenseManager.canAddMore(items.length + addedCount, activeLicense)) {
                      alert(t('limit_reached_d'));
                      break;
                    }
                    allowedItems.push(item);
                    addedCount++;
                  }
                  if (allowedItems.length > 0) {
                    await vaultManager.addEntries(allowedItems.map(item => ({
                      id: item.id,
                      serviceName: item.serviceName!,
                      username: item.username!,
                      secretPayload: item.secretPayload!,
                      category: item.category,
                      updated_at: item.updated_at,
                      version: item.version,
                      type: item.type
                    })));
                  }
                  loadItems();
                };
                reader.readAsText(file);
              }
            }} /></span></label>
            </div>
          )}

          {appState === 'UNLOCKED' && viewMode === 'DUPLICATES' && (() => {
            const duplicateGroups = AIGuard.findDuplicateGroups(items, similarityThreshold / 100);
            return (
              <div className="vault-content settings-view">
                <p className="blueprint-text" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 12px' }}>
                  <span>🤖 {t('opt_duplicates') || 'AI 重複整理'}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{t('dup_groups') || '群組數'}: {duplicateGroups.length}</span>
                </p>
                
                {/* Slider Controls */}
                <div style={{ background: '#111', padding: '10px 12px', borderRadius: 6, border: '1px solid #333', marginBottom: 15 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}>
                    <span style={{ color: 'var(--text-dim)' }}>{t('dup_threshold') || '服務名稱相似度閾值'}</span>
                    <span style={{ color: 'var(--industrial-yellow)', fontWeight: 'bold' }}>{similarityThreshold}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="10" 
                    max="100" 
                    value={similarityThreshold} 
                    onChange={e => setSimilarityThreshold(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--industrial-yellow)', cursor: 'pointer' }}
                  />
                  <p style={{ margin: '6px 0 0', fontSize: 9, color: 'var(--text-dim)', lineHeight: '1.2' }}>
                    {t('dup_desc') || '系統將自動找出使用者名稱相同，且服務名稱相似度達指定比例以上的重複項目。'}
                  </p>
                </div>

                {/* Duplicate List */}
                <div className="items-list" style={{ maxHeight: 220, overflowY: 'auto' }}>
                  {duplicateGroups.length === 0 ? (
                    <div style={{ textAlign: 'center', marginTop: 40, opacity: 0.5 }}>
                      <p style={{ fontSize: 12 }}>{t('dup_congrats') || '🎉 恭喜！未偵測到任何重複帳密項目。'}</p>
                    </div>
                  ) : (
                    duplicateGroups.map((group, idx) => (
                      <div key={idx} style={{ background: '#111', padding: 10, borderRadius: 6, border: '1px solid #333', marginBottom: 12 }}>
                        <div style={{ borderBottom: '1px solid #222', paddingBottom: 6, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'var(--industrial-yellow)', fontSize: 11, fontWeight: 'bold' }}>📂 {group.keyService}</span>
                          <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                            {t('username_label') || '帳號'}: {group.items[0]?.username || '—'}
                          </span>
                        </div>
                        
                        {group.items.map(item => (
                          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px dashed #222' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontSize: 11, color: '#fff' }}>{item.serviceName}</span>
                              <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                                {t('password_label') || '密碼'}: {visiblePasswords[item.id] ? item.secretPayload.password : '••••••••'} 
                                <span style={{ marginLeft: 6 }}>({new Date(item.updatedAt).toLocaleDateString()})</span>
                              </span>
                            </div>
                            
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button 
                                className="action-btn" 
                                style={{ fontSize: 9, padding: '2px 6px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: 3, cursor: 'pointer' }}
                                onClick={() => setVisiblePasswords(p => ({ ...p, [item.id]: !p[item.id] }))}
                              >
                                {visiblePasswords[item.id] ? (t('label_hide') || '隱藏') : (t('label_show') || '顯示')}
                              </button>
                              <button 
                                className="action-btn delete" 
                                style={{ fontSize: 9, padding: '2px 6px', background: 'rgba(255, 0, 0, 0.1)', border: '1px solid #f44336', color: '#f44336', borderRadius: 3, cursor: 'pointer' }}
                                onClick={async () => {
                                  if (window.confirm(`${t('dup_confirm_d') || '確定要刪除這筆重複憑證嗎？此動作無法復原。'}`)) {
                                    await vaultManager.deleteEntry(item.id);
                                    loadItems();
                                  }
                                }}
                              >
                                {t('label_delete') || '刪除'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>

                <button 
                  className="industrial-btn" 
                  style={{ marginTop: 12, backgroundColor: '#333' }} 
                  onClick={() => setViewMode('SETTINGS')}
                >
                  ← {t('back_btn')}
                </button>
              </div>
            );
          })()}
        </main>
      </div>
  );
}
