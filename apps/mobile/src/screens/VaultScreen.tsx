// [PAC] Sync Stability Fix - Force Bundle Reload - 20260513-1247
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, ScrollView,
  StyleSheet, Alert, Clipboard, StatusBar,
  ActivityIndicator, Platform, PanResponder, LayoutChangeEvent, Linking, Image,
  Animated, KeyboardAvoidingView
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { syncToNativeAutofill, openOSAutofillSettings, refreshiOSCredentialStore } from '../modules/VaultBridge';
import { IAPManager } from '../modules/IAPManager';
import { VaultManager, SyncEngine, PasswordGenerator, translations, CSVProcessor, Watchtower, Icons, TOTPHelper, AIGuard, PrivacyAuditor, PACDiagnostic, CardValidator, LicenseManager, RemoteConfigManager, LicenseTier, P2PManager, Language, languages } from '@private-vault/core';
import { Ionicons } from '@expo/vector-icons';
import { MobileCryptoProvider } from '../providers/MobileCryptoProvider';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { MobileStorageProvider } from '../providers/MobileStorageProvider';
import { MobileGoogleDriveSyncProvider } from '../providers/MobileGoogleDriveSyncProvider';
import { Buffer } from '@craftzdog/react-native-buffer';



import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';

WebBrowser.maybeCompleteAuthSession();

type VaultAppState = 'LOADING' | 'SETUP' | 'LOCKED' | 'UNLOCKED';
type ViewMode = 'LIST' | 'ADD' | 'EDIT' | 'SETTINGS' | 'LANG_PICKER' | 'DATA_MANAGE' | 'CHANGE_KEY' | 'MANAGE_CATS' | 'PAC_MONITOR' | 'MANUAL' | 'DIAGNOSTIC' | 'DOCS' | 'DUPLICATES';


const BIOMETRIC_KEY = 'pv_biometric_master';
const LOCAL_STORE_OPTS = { keychainAccessible: (SecureStore as any).WHEN_UNLOCKED_THIS_DEVICE_ONLY || (SecureStore as any).KeychainAccessibility?.WHEN_UNLOCKED_THIS_DEVICE_ONLY || 0 };

// --- 雙重持久化儲存輔助工具 ---
const pvStore = {
  get: async (key: string, secure = true) => {
    let val = null;
    if (secure) {
      try { val = await SecureStore.getItemAsync(key, LOCAL_STORE_OPTS); } catch (e) {}
    }
    if (!val) {
      try { val = await AsyncStorage.getItem(key); } catch (e) {}
    }
    return val;
  },
  set: async (key: string, val: string, secure = true) => {
    if (secure) {
      try { await SecureStore.setItemAsync(key, val, LOCAL_STORE_OPTS); } catch (e) {}
    }
    try { await AsyncStorage.setItem(key, val); } catch (e) {}
  },
  remove: async (key: string) => {
    try { await SecureStore.deleteItemAsync(key, LOCAL_STORE_OPTS); } catch (e) {}
    try { await AsyncStorage.removeItem(key); } catch (e) {}
  }
};


const useAppTheme = (theme: 'dark' | 'light') => {
  return React.useMemo(() => {
    const C = theme === 'dark' ? {
      bg: '#1A1A1A', card: '#2D2D2D', yellow: '#FFC107',
      dim: '#888888', white: '#FFFFFF', red: '#F44336',
      green: '#4CAF50', blue: '#2196F3', border: '#444444',
      text: '#FFFFFF', panel: '#252525', inputBg: '#2D2D2D', inputBorder: '#555555',
      invText: '#000000', icon: '#888888'
    } : {
      bg: '#F5F5F5', card: '#FFFFFF', yellow: '#D99000',
      dim: '#666666', white: '#111111', red: '#D32F2F',
      green: '#2E7D32', blue: '#1976D2', border: '#DDDDDD',
      text: '#111111', panel: '#F0F0F0', inputBg: '#FFFFFF', inputBorder: '#CCCCCC',
      invText: '#FFFFFF', icon: '#333333'
    };

    const s = StyleSheet.create({
      container: { flex: 1, backgroundColor: C.bg, paddingTop: Platform.OS === 'android' ? (StatusBar?.currentHeight || 0) : (Platform.OS === 'ios' ? 47 : 0) },
      header: { 
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
        paddingHorizontal: 16, paddingVertical: 8,
        backgroundColor: 'transparent', borderBottomWidth: 0,
        minHeight: 65, overflow: 'visible'
      },
      headerTitle: { fontSize: 18, fontWeight: 'bold', color: C.yellow, fontFamily: 'Courier New', letterSpacing: 2, flex: 1, marginRight: 10 },
      headerIcons: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'flex-end' },
      headerIconContainer: { 
        width: 40, height: 40, justifyContent: 'center', alignItems: 'center', 
        backgroundColor: 'transparent',
        shadowColor: 'transparent', shadowOpacity: 0, elevation: 0, borderWidth: 0
      },
      section: { color: C.yellow, fontSize: 14, fontWeight: '700', letterSpacing: 1, marginBottom: 12 },
      settingGroup: { backgroundColor: C.panel, borderRadius: 12, marginBottom: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
      groupLabel: { color: C.dim, fontSize: 10, padding: 12, paddingBottom: 4, letterSpacing: 1 },
      settingItem: { 
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
        paddingVertical: 18, 
        paddingLeft: 16, paddingRight: 16,
        borderBottomWidth: 1, borderBottomColor: C.border 
      },
      settingText: { color: C.text, fontSize: 15, flex: 1, marginRight: 12 },
      settingStatus: { color: C.dim, fontSize: 13, textAlign: 'right' },
      dot: { width: 10, height: 10, borderRadius: 5 },
      body: { flexGrow: 1, padding: 20 },
      dim: { fontSize: 12, color: C.dim, fontFamily: 'Courier New', marginBottom: 8 },
      input: { backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.inputBorder, color: C.text, padding: 12, fontFamily: 'Courier New', fontSize: 14, marginBottom: 16 },
      btn: { backgroundColor: C.yellow, padding: 14, alignItems: 'center', marginTop: 4 },
      btnText: { fontWeight: 'bold', fontFamily: 'Courier New', fontSize: 14, color: C.invText },
      smallBtn: { backgroundColor: C.yellow, paddingHorizontal: 8, paddingVertical: 4 },
      smallBtnText: { fontWeight: 'bold', fontFamily: 'Courier New', fontSize: 10, color: C.invText },
      statusText: { marginTop: 12, fontSize: 11, color: C.dim, fontFamily: 'Courier New' },
      card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, marginBottom: 10, flexDirection: 'row', overflow: 'hidden', padding: 10, alignItems: 'center' },
      accent: { width: 4, backgroundColor: C.yellow, marginRight: 0, marginLeft: -10, marginTop: -10, marginBottom: -10 },
      cardTitle: { fontSize: 14, fontWeight: 'bold', color: C.text, fontFamily: 'Courier New', flex: 1 },
      cardSubtitle: { fontSize: 12, color: C.dim, fontFamily: 'Courier New' },
      pwdRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.bg, padding: 6, marginTop: 6, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed' },
      pwdOff: { color: C.yellow, letterSpacing: 4, fontFamily: 'Courier New', fontSize: 12, flex: 1 },
      pwdOn: { color: C.text, fontFamily: 'Courier New', fontSize: 11, flex: 1 },
      link: { color: C.dim, fontFamily: 'Courier New', fontSize: 11, textDecorationLine: 'underline' },
      tag: { color: C.dim, fontFamily: 'Courier New', fontSize: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 5, paddingVertical: 2 },
      onboardOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: 25 },
      onboardCard: { backgroundColor: C.panel, borderRadius: 28, padding: 30, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: C.yellow, shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 15, elevation: 20 },
      secCard: { backgroundColor: C.panel, padding: 12, borderRadius: 8, width: '31%', minHeight: 65, justifyContent: 'center' },
      secCardActive: { borderWidth: 1 },
      genPanel: { backgroundColor: theme === 'dark' ? '#111' : '#E8E8E8', borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 16 },
      reqTag: { borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 8, paddingVertical: 3 },
      reqTagOn: { borderColor: C.yellow, backgroundColor: 'rgba(255,193,7,0.1)' },
      reqTagTxt: { fontSize: 10, color: C.dim, fontFamily: 'Courier New', fontWeight: 'bold' },
      reqTagTxtOn: { color: C.yellow },
      tab: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.panel, marginRight: 8, borderWidth: 1, borderColor: C.border },
      tabActive: { borderColor: C.yellow, backgroundColor: 'rgba(255,193,7,0.1)' },
      tabText: { color: C.dim, fontSize: 12, fontWeight: 'bold', fontFamily: 'Courier New' },
      tabTextActive: { color: C.yellow },
      onboardContainer: { flex: 1, backgroundColor: C.bg },
      onboardIconContainer: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center', marginVertical: 40 },
      onboardIcon: { width: 60, height: 60 },
      onboardTitle: { fontSize: 24, fontWeight: 'bold', color: C.yellow, textAlign: 'center', marginBottom: 16 },
      onboardDesc: { fontSize: 15, color: C.text, textAlign: 'center', lineHeight: 22, paddingHorizontal: 20, marginBottom: 40 },
      onboardBtn: { backgroundColor: C.yellow, paddingVertical: 16, width: '100%', borderRadius: 12, alignItems: 'center' },
      onboardBtnText: { color: C.invText, fontSize: 16, fontWeight: 'bold' },
    });
    return { C, s };
  }, [theme]);
};

// --- 安全性檢查輔助函數 ---
const isWeakPassword = (password: string) => {
  if (!password) return true;
  return password.length < 12 || !/[A-Z]/.test(password) || !/[0-9]/.test(password);
};

// --- 系統預設圖示組件 (極致穩定版) ---
const HeaderIconButton = React.memo(({ name, onPress, color }: any) => (
  <TouchableOpacity 
    onPress={onPress} 
    activeOpacity={0.6}
    hitSlop={{ top: 15, bottom: 15, left: 10, right: 10 }}
    style={{ width: 36, height: 36, justifyContent: 'center', alignItems: 'center' }}
  >
    <Ionicons name={name} size={24} color={color || '#FFC107'} />
  </TouchableOpacity>
));

export function VaultScreen() {
  const vaultManagerRef = useRef<VaultManager | null>(null);
  const syncEngineRef = useRef<SyncEngine | null>(null);
  const cryptoProviderRef = useRef<MobileCryptoProvider | null>(null);
  const storageProviderRef = useRef<MobileStorageProvider | null>(null);
  const cloudProviderRef = useRef<MobileGoogleDriveSyncProvider | null>(null);
  const isPickingRef = useRef(false);
  const [appState, setAppState] = useState<VaultAppState>('LOADING');
  const [status, setStatus] = useState('');
  const [setupGuideStep, setSetupGuideStep] = useState<string | null>(null);
  const [showRepairHint, setShowRepairHint] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('LIST');
  const [docType, setDocType] = useState<'PRIVACY' | 'SECURITY' | 'MANUAL'>('MANUAL');
  const [appTheme, setAppTheme] = useState<'dark' | 'light'>('dark');
  const { C, s } = useAppTheme(appTheme);
  const [masterPassword, setMasterPassword] = useState('');
  const masterPwdRef = React.useRef('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [breachedIds, setBreachedIds] = useState<Record<string, number>>({});
  const [licenseTier, setLicenseTier] = useState<LicenseTier>('trial');
  const [trialStart, setTrialStart] = useState(Date.now());
  const activeLicense = LicenseManager.getStatus(licenseTier, trialStart, items.length);

  const [revealedItems, setRevealedItems] = useState<Record<string, boolean>>({});
  const [revealedCvv, setRevealedCvv] = useState<Record<string, boolean>>({});
  const [activeFilter, setActiveFilter] = useState<'NONE' | 'WEAK' | 'REUSED' | 'LEAKED'>('NONE');
  const [categories, setCategories] = useState<{id: string, name: string}[]>([
    {id: 'ungrouped', name: 'Uncategorized'},
    {id: 'work', name: 'Work'},
    {id: 'personal', name: 'Personal'},
    {id: 'email', name: 'E-mail'},
    {id: 'shopping', name: 'Shopping'},
    {id: 'others', name: 'Others'}
  ]);

  const [failedDecryptionCount, setFailedDecryptionCount] = useState(0);

  const cardRef1 = useRef<TextInput>(null);
  const cardRef2 = useRef<TextInput>(null);
  const cardRef3 = useRef<TextInput>(null);
  const cardRef4 = useRef<TextInput>(null);

  useEffect(() => {
    const unsubscribe = PrivacyAuditor.subscribe(newLog => {
      setPacLogs(prev => [...prev.slice(-100), newLog]);
    });
    return () => unsubscribe();
  }, []);
  
  // --- 分類標籤狀態 ---
  const [selectedCat, setSelectedCat] = useState('ALL');
  const [showCatPickerId, setShowCatPickerId] = useState<string | null>(null);
  const [itemCat, setItemCat] = useState('ungrouped');
  const [newCatName, setNewCatName] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [newService, setNewService] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newTotp, setNewTotp] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // Credit Card States
  const [cardType, setCardType] = useState<'PASSWORD' | 'CARD'>('PASSWORD');
  const [cardholder, setCardholder] = useState('');
  const [cardNumber1, setCardNumber1] = useState('');
  const [cardNumber2, setCardNumber2] = useState('');
  const [cardNumber3, setCardNumber3] = useState('');
  const [cardNumber4, setCardNumber4] = useState('');
  const cardNumber = cardNumber1 + cardNumber2 + cardNumber3 + cardNumber4;
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');

  const handleExportPDF = async () => {
    const html = `
      <html>
        <head>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #333; line-height: 1.6; }
            h1 { color: #FFC107; border-bottom: 2px solid #FFC107; padding-bottom: 10px; }
            h2 { color: #555; margin-top: 30px; }
            .step { margin-bottom: 20px; padding: 15px; background: #f9f9f9; border-left: 5px solid #FFC107; }
            .icon { font-weight: bold; color: #FFC107; margin-right: 5px; }
          </style>
        </head>
        <body>
          <h1>${t('manual_title')}</h1>
          
          <h2>${t('sec_arch_t')}</h2>
          <div class="step">
            • ${t('sec_arch_d1')}<br/>
            • ${t('sec_arch_d2')}<br/>
            • ${t('sec_arch_d3')}<br/>
            • ${t('sec_arch_d4')}
          </div>

          <h2>${t('manual_init_t')}</h2>
          <div class="step">
            ${t('manual_init_d')}
          </div>

          <h2>${t('manual_import_t')}</h2>
          <div class="step">
            ${t('manual_import_d')}
          </div>

          <h2>${t('manual_sync_t')}</h2>
          <div class="step">
            ${t('manual_sync_d')}
          </div>

          <h2>${t('manual_trouble_t')}</h2>
          <div class="step">
            ${t('manual_trouble_d').replace('\n', '<br/>')}
          </div>
        </body>
      </html>
    `;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (e) { Alert.alert(t('status_error'), t('err_pdf_export')); }
  };
  const [cardBrand, setCardBrand] = useState('Unknown');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const autoBioTriggeredRef = useRef(false);
  const [genConfig, setGenConfig] = useState({ upper: true, lower: true, number: true, special: true, length: 16 });
  const [similarityThreshold, setSimilarityThreshold] = useState(60);
  const [sliderWidth, setSliderWidth] = useState(0);

  const handleSliderMove = useCallback((x: number) => {
    if (sliderWidth <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / sliderWidth));
    const newLen = Math.round(8 + ratio * 24);
    setGenConfig(p => ({ ...p, length: newLen }));
  }, [sliderWidth]);

  const sliderResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: any) => handleSliderMove(evt.nativeEvent.locationX),
      onPanResponderMove: (evt: any) => handleSliderMove(evt.nativeEvent.locationX),
    })
  ).current;
  const [syncStatus, setSyncStatus] = useState('');
  const [lang, setLang] = useState<Language>('en');
  const [products, setProducts] = useState<any[]>([]);
  
  const handleLangChange = async (newLang: Language) => {
    setLang(newLang);
    await pvStore.set('pv_lang', newLang);
  };
  const [sortBy, setSortBy] = useState<'name' | 'newest' | 'oldest'>('name');
  const [activeTab, setActiveTab] = useState<'ALL' | 'PASSWORD' | 'CARD'>('ALL');
  const [showSortPicker, setShowSortPicker] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showMasterKey, setShowMasterKey] = useState(false);
  const [pacLogs, setPacLogs] = useState<string[]>([]);
  const [diagnosticResults, setDiagnosticResults] = useState<any[] | null>(null);
  const isCardValid = useMemo(() => {
    if (cardType !== 'CARD') return true;
    const clean = cardNumber.replace(/\D/g, '');
    if (clean.length < 13) return true; // Don't show error while typing
    return CardValidator.validateLuhn(clean);
  }, [cardNumber, cardType]);
  const scrollRef = useRef<ScrollView>(null);



  const handleWipeAll = async () => {
    const title = t('wipe_all_t');
    const desc = t('wipe_all_d');
    
    Alert.alert(
      title, desc,
      [
        { text: t('label_cancel'), style: 'cancel' },
        { 
          text: t('opt_wipe_all'), 
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              await vaultManagerRef.current!.wipeAll();
              if (syncEngineRef.current) await syncEngineRef.current.forceSyncCloud([]);
              setItems([]);
              setMasterPassword('');
              setConfirmPassword('');
              setAppState('SETUP');
              Alert.alert(t('status_success'), t('wipe_success'));
              setViewMode('LIST');
            } catch (e: any) { Alert.alert(t('wipe_err_t'), e.message); }
            setIsLoading(false);
          }
        }
      ]
    );
  };

  const handleCardNumberChange = (text: string, index: number) => {
    const clean = text.replace(/[^0-9]/g, '');
    
    // 1. If pasting a full card number (length >= 12)
    if (clean.length >= 12) {
      const fullNum = clean.slice(0, 16);
      setCardNumber1(fullNum.slice(0, 4));
      setCardNumber2(fullNum.slice(4, 8));
      setCardNumber3(fullNum.slice(8, 12));
      setCardNumber4(fullNum.slice(12, 16));
      
      if (fullNum.length <= 4) {
        cardRef1.current?.focus();
      } else if (fullNum.length <= 8) {
        cardRef2.current?.focus();
      } else if (fullNum.length <= 12) {
        cardRef3.current?.focus();
      } else {
        cardRef4.current?.focus();
      }
      return;
    }

    // 2. Normal typing or single character overflows
    if (index === 1) {
      if (clean.length > 4) {
        setCardNumber1(clean.slice(0, 4));
        const extra = clean.slice(4);
        setCardNumber2(extra);
        cardRef2.current?.focus();
      } else {
        setCardNumber1(clean);
        if (clean.length === 4) {
          cardRef2.current?.focus();
        }
      }
    } else if (index === 2) {
      if (clean.length > 4) {
        setCardNumber2(clean.slice(0, 4));
        const extra = clean.slice(4);
        setCardNumber3(extra);
        cardRef3.current?.focus();
      } else {
        setCardNumber2(clean);
        if (clean.length === 4) {
          cardRef3.current?.focus();
        }
      }
    } else if (index === 3) {
      if (clean.length > 4) {
        setCardNumber3(clean.slice(0, 4));
        const extra = clean.slice(4);
        setCardNumber4(extra);
        cardRef4.current?.focus();
      } else {
        setCardNumber3(clean);
        if (clean.length === 4) {
          cardRef4.current?.focus();
        }
      }
    } else if (index === 4) {
      setCardNumber4(clean.slice(0, 4));
    }
  };

  const handleCardKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace') {
      if (index === 2 && !cardNumber2) {
        cardRef1.current?.focus();
      } else if (index === 3 && !cardNumber3) {
        cardRef2.current?.focus();
      } else if (index === 4 && !cardNumber4) {
        cardRef3.current?.focus();
      }
    }
  };

  const handleExpiryChange = (text: string) => {
    let clean = text.replace(/[^0-9]/g, '');
    if (clean.length > 4) clean = clean.slice(0, 4);
    if (clean.length > 2) {
      setExpiry(`${clean.slice(0, 2)}/${clean.slice(2)}`);
    } else {
      setExpiry(clean);
    }
  };

  const detectCardBrand = (num: string) => {
    const clean = num.replace(/\s/g, '');
    if (/^4/.test(clean)) return 'Visa';
    if (/^5[1-5]/.test(clean)) return 'MasterCard';
    if (/^3[47]/.test(clean)) return 'Amex';
    if (/^6(?:011|5)/.test(clean)) return 'Discover';
    return 'Unknown';
  };

  useEffect(() => {
    if (cardType === 'CARD') setCardBrand(detectCardBrand(cardNumber));
  }, [cardNumber1, cardNumber2, cardNumber3, cardNumber4, cardType]);

  const t = (key: string): string => {
    try {
      if (!translations) return key;

      // 確保 lang 為有效字串且非空，否則預設 fallback 至 'en'
      const currentLang = (typeof lang === 'string' && lang) ? lang : 'en';

      const targetLang = Object.keys(translations).find(
        k => k.toLowerCase() === currentLang.toLowerCase()
      ) || 'en';

      // [PAC] V1.16.0 Globalization Engine:
      // 1. Check core translation for ALL 12 languages (Priority 1)
      const coreVal = (translations as any)[targetLang]?.[key] || (translations as any)['en']?.[key];
      if (coreVal && typeof coreVal === 'string') return coreVal;

      // 2. If it's a category and not in core, check user-defined categories (Priority 2)
      if (key.startsWith('cat_')) {
        const catId = key.replace('cat_', '');
        const customCat = categories.find(c => c.id === catId);
        if (customCat) return customCat.name;
      }

      return key;
    } catch (e) {
      // 最後的安全 fallback 機制：嘗試從 translations['en'] 中尋找
      try {
        const fallbackVal = (translations as any)?.['en']?.[key];
        if (fallbackVal && typeof fallbackVal === 'string') return fallbackVal;
      } catch (_) {}
      return key;
    }
  };

  const copy = (text: string, label: string) => {
    Clipboard.setString(text);
    const isCJK = ['zh-tw', 'zh-cn', 'ja', 'ko'].includes(lang.toLowerCase());
    const spacer = isCJK ? '' : ' ';
    Alert.alert(
      t('status_success') || 'Success',
      `${label}${spacer}${t('copied') || 'copied'}`
    );
    setTimeout(() => {
      Clipboard.setString('');
    }, 60000);
  };
  // 初始化：檢查是否有 Vault、是否支援生物識別
  useEffect(() => {
    const init = async () => {
      try {
        if (!vaultManagerRef.current) {
          cryptoProviderRef.current = new MobileCryptoProvider();
          storageProviderRef.current = new MobileStorageProvider();
          vaultManagerRef.current = new VaultManager(cryptoProviderRef.current, storageProviderRef.current);
          
          // Inject license delegates for SyncEngine to bridge with IAPManager (LWW implementation)
          (vaultManagerRef.current as any).getLicenseInfo = async () => await IAPManager.getStoredTier();
          cloudProviderRef.current = new MobileGoogleDriveSyncProvider();
          syncEngineRef.current = new SyncEngine(vaultManagerRef.current, cloudProviderRef.current);
        }
        
        const timeout = new Promise(res => setTimeout(() => res('TIMEOUT'), 5000));
        const result = await Promise.race([
          Promise.all([
            pvStore.get('pv_salt'),
            LocalAuthentication.supportedAuthenticationTypesAsync().catch(() => []),
            pvStore.get('pv_lang'),
            pvStore.get('pv_biometric_enabled'),
            pvStore.get('pv_onboarding_done'),
            pvStore.get('pv_categories'),
            LocalAuthentication.isEnrolledAsync().catch(() => false),
          ]),
          timeout
        ]);

        if (result === 'TIMEOUT') {
          console.warn('Init timed out, defaulting to SETUP');
          setAppState('SETUP');
          return;
        }

        const [salt, biometricType, savedLang, bioEnabledVal, onboarded, savedCats, isEnrolled] = result as any;
        if (savedLang) setLang(savedLang as Language);
        if (savedCats) {
          try {
            let parsed = JSON.parse(savedCats);
            // [PAC] Force Migration: Ensure 'ungrouped' always exists in the list
            if (!parsed.find((c: any) => c.id === 'ungrouped')) {
              parsed = [{id: 'ungrouped', name: 'Uncategorized'}, ...parsed];
            }
            setCategories(parsed);
          } catch (e) {
            console.error('Failed to parse categories', e);
          }
        }
        
        // 偵測首裝引導
        if (!onboarded && salt) {
          setShowOnboarding(true);
        }

        const hasHardware = (biometricType || []).length > 0;
        const isExplicitlyDisabled = await pvStore.get('pv_biometric_disabled') === 'true';
        const isBioEnabled = bioEnabledVal !== 'false';
        setBiometricAvailable(hasHardware && isEnrolled && isBioEnabled && !isExplicitlyDisabled);
        
        const guideStep = await pvStore.get('pv_setup_guide_step');
        if (guideStep) {
          setSetupGuideStep(guideStep);
        }
        
        setAppState(salt ? 'LOCKED' : 'SETUP');
      } catch (e) {
        console.error('Initialization error:', e);
        setAppState('SETUP');
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  const loadItems = useCallback(async () => {
    if (!vaultManagerRef.current!.isUnlocked()) return;
    try {
      let data = await vaultManagerRef.current!.getDecryptedItems();
      
      // [PAC 自癒機制]：如果發現解密失敗，且手上有主金鑰，嘗試重新解鎖以校準 Session Key
      if (data.failedCount > 0 && masterPwdRef.current) {
        console.log(`[PAC] Decryption failure detected (${data.failedCount}). Attempting silent key alignment...`);
        const salt = await pvStore.get('pv_salt');
        if (salt) {
          await vaultManagerRef.current!.unlockVault(masterPwdRef.current, salt);
          data = await vaultManagerRef.current!.getDecryptedItems(); // 重新嘗試加載
          console.log(`[PAC] Post-alignment results: ${data.items.length} success, ${data.failedCount} fail.`);
        }
      }

      setItems(data.items);
      setFailedDecryptionCount(data.failedCount || 0);
      
      // Background breach check
      data.items.forEach(async (item: any) => {
        if (!item.secretPayload?.password) return;
        const { isPwned, count } = await Watchtower.checkBreach(item.secretPayload.password);
        if (isPwned) {
          setBreachedIds(prev => ({ ...prev, [item.id]: count }));
        }
      });

      // 同步最新密碼與信用卡至原生自動填寫擴充模組
      await syncToNativeAutofill(data.items.map(item => ({
        id: item.id,
        serviceName: item.serviceName,
        username: item.username,
        password: item.secretPayload.password,
        type: item.secretPayload.cardNumber ? 'CARD' : 'PASSWORD',
        cardholderName: item.secretPayload.cardholderName,
        cardNumber: item.secretPayload.cardNumber,
        expiryDate: item.secretPayload.expiryDate,
        cvv: item.secretPayload.cvv
      })));
    } catch (e: any) { console.error(e); }
  }, []);

  useEffect(() => {
    if (appState === 'UNLOCKED') loadItems();
  }, [appState, loadItems]);

  const [, setTick] = useState(0);


  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleBiometricUnlock = useCallback(async () => {
    setIsLoading(true);
    setStatus(t('biometric_prompt') + '...');
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('biometric_prompt'),
        fallbackLabel: t('biometric_fallback'),
        cancelLabel: t('cancel_btn'),
        disableDeviceFallback: false,
      });

      if (!result.success) {
        setStatus(t('status_bio_cancelled'));
        setIsLoading(false);
        return;
      }

      const storedPwd = await pvStore.get(BIOMETRIC_KEY);
      if (!storedPwd) {
        setStatus(t('status_bio_first_unlock'));
        setIsLoading(false);
        return;
      }

      const salt = await pvStore.get('pv_salt');
      if (!salt) throw new Error(t('err_vault_not_found'));
      await vaultManagerRef.current!.unlockVault(storedPwd, salt);
      masterPwdRef.current = storedPwd;
      const guideStep = await pvStore.get('pv_setup_guide_step');
      setSetupGuideStep(guideStep || null);
      setAppState('UNLOCKED');
      setMasterPassword('');
      // iOS 鍵盤建議列同步（非阻塞）
      refreshiOSCredentialStore().catch(() => {});
    } catch (e: any) {
      setStatus(`Biometric error: ${e.message}`);
    }
    setIsLoading(false);
  }, [t]);

  // 預設開啟生物識別解鎖：當進入鎖定畫面且已啟用生物識別時，自動觸發生物識別對話框
  useEffect(() => {
    if (appState === 'LOCKED' && biometricAvailable && !isLoading && !autoBioTriggeredRef.current) {
      autoBioTriggeredRef.current = true;
      const timer = setTimeout(() => {
        handleBiometricUnlock();
      }, 500);
      return () => clearTimeout(timer);
    } else if (appState !== 'LOCKED') {
      autoBioTriggeredRef.current = false;
    }
  }, [appState, biometricAvailable, isLoading, handleBiometricUnlock]);

  const handleSetup = async () => {
    if (masterPassword !== confirmPassword) { setStatus('Error: Passwords do not match'); return; }
    if (masterPassword.length < 8) { setStatus('Error: Minimum 8 characters'); return; }
    setIsLoading(true);
    setStatus('Deriving key... (Argon2id)');
    try {
      const { key, salt } = await cryptoProviderRef.current!.deriveKey(masterPassword);
      const verifyData = await cryptoProviderRef.current!.encryptData('AUTH_OK', key);
      await pvStore.set('pv_salt', salt);
      await pvStore.set('pv_verify', JSON.stringify(verifyData));
      await pvStore.set('pv_lang', lang);
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const isExplicitlyDisabled = await pvStore.get('pv_biometric_disabled') === 'true';
      if (hasHardware && isEnrolled && !isExplicitlyDisabled) {
        try {
          await SecureStore.setItemAsync(BIOMETRIC_KEY, masterPassword, LOCAL_STORE_OPTS);
          await pvStore.set('pv_biometric_disabled', 'false');
          await pvStore.set('pv_biometric_enabled', 'true');
          setBiometricAvailable(true);
        } catch (e) {
          console.log('Biometric link failed:', e);
        }
      }
      await vaultManagerRef.current!.unlockVault(masterPassword, salt);
      masterPwdRef.current = masterPassword;
      setMasterPassword(''); setConfirmPassword('');
      await pvStore.set('pv_setup_guide_step', 'NEED_GOOGLE_PROMPT');
      setSetupGuideStep('NEED_GOOGLE_PROMPT');
      setAppState('UNLOCKED');
      setStatus('');
    } catch (e: any) { setStatus(`Setup Failed: ${e.message}`); }
    setIsLoading(false);
  };

  const handleUnlock = async () => {
    setIsLoading(true);
    setStatus('Verifying...');
    try {
      const salt = await pvStore.get('pv_salt');
      const verifyStr = await pvStore.get('pv_verify');
      if (!salt || !verifyStr) throw new Error(t('err_vault_not_found'));
      
      const { key } = await cryptoProviderRef.current!.deriveKey(masterPassword, salt);
      const decryptResult = await cryptoProviderRef.current!.decryptData(JSON.parse(verifyStr), key).catch(() => null);

      if (decryptResult !== 'AUTH_OK') {
        throw new Error('Invalid Master Key');
      }
      
      await vaultManagerRef.current!.unlockVault(masterPassword, salt, key);
      masterPwdRef.current = masterPassword;
      setMasterPassword('');
      const guideStep = await pvStore.get('pv_setup_guide_step');
      setSetupGuideStep(guideStep || null);
      setAppState('UNLOCKED');
      setStatus('');
      // iOS 鍵盤建議列同步（非阻塞）
      refreshiOSCredentialStore().catch(() => {});
      
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const isExplicitlyDisabled = await pvStore.get('pv_biometric_disabled') === 'true';
      if (hasHardware && isEnrolled && !isExplicitlyDisabled) {
        try {
          await SecureStore.setItemAsync(BIOMETRIC_KEY, masterPassword, LOCAL_STORE_OPTS);
          await pvStore.set('pv_biometric_disabled', 'false');
          await pvStore.set('pv_biometric_enabled', 'true');
          setBiometricAvailable(true);
        } catch (e) {
          console.log('Biometric link failed:', e);
        }
      }
    } catch (e: any) { 
      let errMsg = e.message;
      if (errMsg.includes('Cipher.final')) {
        errMsg = t('err_master_key_corrupt');
      }
      setStatus(`Error: ${errMsg}`); 
    }
    setIsLoading(false);
  };

  const handleEmergencyReset = () => {
    Alert.alert(t('emergency_reset_t'), t('emergency_reset_d'),
      [
        { text: t('cancel_btn'), style: 'cancel' },
        { 
          text: t('reset_btn'), 
          style: 'destructive', 
          onPress: async () => {
            await pvStore.remove('pv_salt');
            await pvStore.remove('pv_verify');
            await pvStore.remove(BIOMETRIC_KEY);
            await pvStore.remove('pv_biometric_disabled');
            await pvStore.remove('pv_biometric_enabled');
            await storageProviderRef.current!.saveBatch([]);
            setAppState('SETUP');
            setStatus(t('status_vault_reset'));
          }
        }
      ]
    );
  };

  const clearForm = () => {
    setNewService(''); setNewUsername(''); setNewPassword(''); setNewTotp('');
    setNewUrl(''); setNewNotes('');
    setCardholder('');
    setCardNumber1('');
    setCardNumber2('');
    setCardNumber3('');
    setCardNumber4('');
    setExpiry('');
    setCvv('');
    setCardBrand('Unknown');
    setEditingId(null); setShowNewPwd(false); setStatus('');
    setItemCat('ungrouped'); // [PAC] Reset to 'Uncategorized' default
  };

  const handleSave = async () => {
    const finalUsername = cardType === 'CARD' ? cardholder : newUsername;
    const fullCardNumber = cardType === 'CARD' ? (cardNumber1 + cardNumber2 + cardNumber3 + cardNumber4) : '';

    if (cardType !== 'CARD' && (!newService || !finalUsername || !newPassword)) { setStatus(t('err_fields_required')); return; }
    if (cardType === 'CARD' && (!newService || !finalUsername || !fullCardNumber)) { setStatus(t('err_fields_required')); return; }
    
    // [PAYWALL]：檢查是否達到儲存上限
    if (viewMode === 'ADD' && !LicenseManager.canAddMore(items.length, activeLicense)) {
      Alert.alert(t('limit_reached_t'), t('limit_reached_d'));
      return;
    }
    
    try {
      const secretPayload = cardType === 'CARD' 
        ? { cardholderName: cardholder, cardNumber: fullCardNumber, expiryDate: expiry, cvv, brand: cardBrand, notes: newNotes }
        : { password: newPassword, totpSecret: newTotp, url: newUrl, notes: newNotes };

      const finalCat = cardType === 'CARD' ? undefined : itemCat;

      if (editingId) {
        await vaultManagerRef.current!.updateEntry(editingId, newService, finalUsername, secretPayload, finalCat);
      } else {
        await vaultManagerRef.current!.addEntry(newService, finalUsername, secretPayload, finalCat);
      }
      if (cardType === 'CARD') {
        setActiveTab('CARD');
      }
      clearForm(); setViewMode('LIST'); loadItems();
      triggerAutoSync();
    } catch (e: any) { setStatus(`Error: ${e.message}`); }
    setIsLoading(false);
  };

  const handleQuickCatChange = async (id: string, newCat: string) => {
    try {
      const item = items.find(i => i.id === id);
      if (!item) return;
      // [PAC] Force Sync: Ensure metadata change (category) triggers updatedAt update
      await vaultManagerRef.current!.updateEntry(id, item.serviceName, item.username, item.secretPayload, newCat);
      await loadItems();
      setShowCatPickerId(null);
      await triggerAutoSync(); // 即時推送到雲端
    } catch (e: any) { Alert.alert(t('status_error'), e.message); }
  };

  const triggerAutoSyncRef = useRef<(() => Promise<void>) | null>(null);

  const saveCategories = async (newCats: any[], updatedAt: number = Date.now(), shouldSync: boolean = true) => {
    setCategories(newCats);
    await SecureStore.setItemAsync('pv_categories', JSON.stringify(newCats), LOCAL_STORE_OPTS);
    await SecureStore.setItemAsync('pv_categories_updated_at', String(updatedAt), LOCAL_STORE_OPTS);
    if (shouldSync) {
      triggerAutoSyncRef.current?.();
    }
  };

  const syncCategories = async (localCats: any[]): Promise<{ categories: any[], updatedAt: number } | null> => {
    try {
      const provider = cloudProviderRef.current;
      if (!provider || typeof provider.saveFile !== 'function' || typeof provider.getFile !== 'function') {
        console.log('[PAC] Google Drive provider not fully ready/authenticated yet for categories sync.');
        return null;
      }

      // Get local updatedAt timestamp
      const localTimeStr = await SecureStore.getItemAsync('pv_categories_updated_at', LOCAL_STORE_OPTS);
      const localUpdatedAt = localTimeStr ? Number(localTimeStr) : 0;

      // Get remote categories
      console.log('[PAC] Fetching remote categories.json...');
      const remoteStr = await provider.getFile('categories.json');
      
      let remotePayload: { categories: any[], updatedAt: number } | null = null;
      if (remoteStr) {
        try {
          const parsed = JSON.parse(remoteStr);
          if (parsed && Array.isArray(parsed.categories) && typeof parsed.updatedAt === 'number') {
            remotePayload = parsed;
          }
        } catch (e) {
          console.warn('[PAC] Failed to parse remote categories.json', e);
        }
      }

      if (remotePayload) {
        console.log(`[PAC] Category sync compare: Local Time ${localUpdatedAt} vs Remote Time ${remotePayload.updatedAt}`);
        if (remotePayload.updatedAt > localUpdatedAt) {
          console.log('[PAC] Remote categories are newer. Applying remote.');
          return remotePayload;
        } else if (localUpdatedAt > remotePayload.updatedAt) {
          console.log('[PAC] Local categories are newer. Pushing local.');
          const payload = { categories: localCats, updatedAt: localUpdatedAt };
          await provider.saveFile('categories.json', JSON.stringify(payload));
          return payload;
        } else {
          console.log('[PAC] Categories are already in sync.');
          return remotePayload;
        }
      } else {
        // No remote payload, push local
        console.log('[PAC] No remote categories found. Initializing cloud with local categories.');
        const payload = { categories: localCats, updatedAt: localUpdatedAt || Date.now() };
        await provider.saveFile('categories.json', JSON.stringify(payload));
        return payload;
      }
    } catch (err) {
      console.warn('[PAC] syncCategories Failed:', err);
    }
    return null;
  };

  const handleMoveCategory = (index: number, direction: 'UP' | 'DOWN') => {
    const newCats = [...categories];
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newCats.length) return;
    [newCats[index], newCats[targetIndex]] = [newCats[targetIndex], newCats[index]];
    saveCategories(newCats);
  };

  const handleDeleteCategory = (id: string) => {
    if (['work', 'personal', 'email', 'shopping', 'others'].includes(id)) {
      Alert.alert(t('status_error'), t('err_sys_cat_delete'));
      return;
    }
    const updated = categories.filter(c => c.id !== id);
    saveCategories(updated);
  };

  const handleDelete = (id: string, serviceName: string) => {
    Alert.alert(t('delete_confirm_t'), t('delete_confirm_d').replace('{service}', serviceName), [{ text: t('cancel_btn'), style: 'cancel' },
      {
        text: t('label_delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await vaultManagerRef.current!.deleteEntry(id);
            if (viewMode === 'EDIT' && editingId === id) { clearForm(); setViewMode('LIST'); }
            loadItems();
            triggerAutoSync(); // 即時同步
          } catch (e: any) { setStatus(`Error: ${e.message}`); }
        }
      }
    ]);
  };

  const handleChangeKey = async () => {
    if (newPassword !== confirmPassword) { setStatus(t('err_pwd_mismatch')); return; }
    if (newPassword.length < 8) { setStatus(t('err_pwd_short')); return; }
    setIsLoading(true);
    setStatus(t('status_reencrypting'));
    try {
      // [PAC 主金鑰修復] core 已內部原子化寫入 pv_salt, pv_verify, pv_salt_updated_at
      await vaultManagerRef.current!.changeMasterKey(newPassword);
      masterPwdRef.current = newPassword;
      if (biometricAvailable) {
        await SecureStore.setItemAsync(BIOMETRIC_KEY, newPassword, LOCAL_STORE_OPTS);
      }
      clearForm(); setViewMode('LIST'); setStatus(t('status_master_key_changed'));
    } catch (e: any) { setStatus(`Error: ${e.message}`); }
    setIsLoading(false);
  };

  const handleSync = async () => {
    const rawItems = await vaultManagerRef.current!.getRawItems();
    const localCount = rawItems.length;
    setSyncStatus(`Syncing ${localCount} items...`);
    
    try {
      const localCats = categories;
      const result = await syncEngineRef.current!.sync(masterPwdRef.current, rawItems, localCats, 0, true);
      
      // [PAC] Manual Category Sync Override: LWW Comparison
      const mergedCatsPayload = await syncCategories(localCats);
      if (mergedCatsPayload) {
        await saveCategories(mergedCatsPayload.categories, mergedCatsPayload.updatedAt, false);
      }

      // Update local license if remote is more advanced/recent (LWW)
      if (result.remoteLicenseTier && result.remoteLicenseTier !== licenseTier) {
        await IAPManager.setStoredTier(result.remoteLicenseTier, result.remoteLicenseUpdatedAt);
        setLicenseTier(result.remoteLicenseTier as LicenseTier);
      }
      const msg = `${t('pac_diag_t')}\n` +
                  `------------------\n` +
                  `- ${t('diag_local_raw')}: ${localCount}\n` +
                  `- ${t('diag_active_after')}: ${result.active}\n` +
                  `- ${t('diag_cloud_total')}: ${result.remoteItemCount || 0}\n` +
                  `- ${t('diag_cloud_acc')}: ${result.remoteAccount || t('label_unknown')}\n` +
                  `- ${t('diag_pushed_total')}: ${result.pushed}\n` +
                  `- ${t('diag_conflicts')}: ${result.conflictsResolved}\n` +
                  `------------------\n` +
                  `${t('diag_sync_status')}: OK`;
      
      setSyncStatus(`Synced: ${result.active} items`);
      loadItems();

      const currentStep = await pvStore.get('pv_setup_guide_step');
      if (currentStep === 'NEED_GOOGLE_PROMPT') {
        await pvStore.set('pv_setup_guide_step', 'NEED_AUTOFILL_PROMPT');
        setSetupGuideStep('NEED_AUTOFILL_PROMPT');
      }

      if (result.remoteAccount === 'Unknown') {
        Alert.alert(
          t('status_error') || 'Sync Error',
          t('err_cloud_unknown') || 'Cloud Account is Unknown. Please sign in to Google again to ensure synchronization works correctly.',
          [{ text: t('ok_btn') || 'OK' }]
        );
      } else {
        Alert.alert(
          t('pac_diag_t') || 'System Integrity Report',
          msg,
          [
            { text: t('ok_btn') || 'OK' },
            { 
              text: t('diag_force_pull') || 'Force Pull from Cloud (Overwrite Local)', 
              style: 'destructive',
              onPress: async () => {
                setStatus('Force Pulling...');
                try {
                  const remote = await syncEngineRef.current!.getRemoteData();
                  if (remote && remote.items && remote.items.length > 0) {
                    await (vaultManagerRef.current as any).storageProvider.saveBatch(remote.items);
                    
                    // [PAC] Force pull categories.json from cloud, ignoring LWW timestamps
                    try {
                      const provider = cloudProviderRef.current;
                      if (provider && typeof provider.getFile === 'function') {
                        const remoteCatsStr = await provider.getFile('categories.json');
                        if (remoteCatsStr) {
                          const parsed = JSON.parse(remoteCatsStr);
                          if (parsed && Array.isArray(parsed.categories)) {
                            console.log('[PAC] Force pulled remote categories:', parsed.categories.length);
                            await saveCategories(parsed.categories, parsed.updatedAt || Date.now(), false);
                          }
                        }
                      }
                    } catch (catErr) {
                      console.warn('[PAC] Force pull categories failed:', catErr);
                    }

                    await loadItems();
                    Alert.alert(
                      t('status_success') || 'Success',
                      (t('pull_success_msg') || 'Successfully pulled {count} items and categories.').replace('{count}', remote.items.length.toString())
                    );
                  } else {
                    Alert.alert(
                      t('status_error') || 'Error',
                      t('pull_empty_err') || 'Cloud is empty or inaccessible. Overwrite canceled to protect local data.'
                    );
                  }
                } catch (err: any) {
                  Alert.alert(t('status_error') || 'Error', err.message);
                }
                setStatus('');
              }
            }
          ]
        );
      }
    } catch (e: any) { 
      let msg = e.message;

      // SIGN_IN_REQUIRED：未登入，提示使用者手動登入
      if (msg === 'SIGN_IN_REQUIRED') {
        Alert.alert(
          t('sync_err_t'),
          t('err_google_not_logged_in'),
          [
            { text: t('cancel'), style: 'cancel' },
            {
              text: t('google_login_btn'),
              onPress: async () => {
                try {
                  await cloudProviderRef.current!.authenticate(true);
                  setSyncStatus(t('google_logged_in_sync'));
                } catch (authErr: any) {
                  if (authErr.message === 'SIGN_IN_CANCELLED') {
                    setSyncStatus('');
                  } else if (authErr.message === 'TOKEN_EMPTY_AFTER_RETRIES') {
                    // Native 登入失敗，自動切換 Web Auth
                    handleWebAuth();
                  } else {
                    setSyncStatus(`${t('err_login_failed').replace('{error}', authErr.message)}`);
                  }
                }
              }
            }
          ]
        );
        setSyncStatus('');
        return;
      }

      if (msg === 'SIGN_IN_CANCELLED') {
        setSyncStatus('');
        return;
      }

      // TOKEN_EMPTY_AFTER_RETRIES：native 登入流程失敗，提供 Web Auth 備援
      if (msg === 'TOKEN_EMPTY_AFTER_RETRIES') {
        Alert.alert(
          t('err_google_login_failed'),
          t('err_native_token_empty_prompt'),
          [
            { text: t('cancel'), style: 'cancel' },
            { text: t('login_with_browser'), onPress: () => handleWebAuth() }
          ]
        );
        setSyncStatus('');
        return;
      }

      if (msg.includes('401') || msg.includes('UNAUTHENTICATED')) {
        msg = t('cloud_expired_msg');
      }
      setSyncStatus(`Sync Error: ${msg}`);
      
      const isWebAuthRequired = 
        msg.includes('WEB_AUTH_REQUIRED') || 
        msg.includes('PAC_AUTH_TOTAL_FAILURE') || 
        msg.includes('getTokens') || 
        msg.includes('signed in');

      Alert.alert(
        t('sync_err_t'), 
        isWebAuthRequired ? (t('web_auth_prompt') || 'Native login service issue detected. Enable Connection Repair Mode?') : msg,
        isWebAuthRequired ? [
          { text: t('cancel') || 'Cancel', style: 'cancel' },
          { 
            text: t('web_auth_btn') || 'Start Repair Mode', 
            onPress: () => handleWebAuth() 
          }
        ] : [{ text: t('ok_btn') || 'OK' }]
      );
    }
    setTimeout(() => setSyncStatus(''), 5000);
  };

  useEffect(() => {
    const handlePurchaseSuccess = async () => {
      const tier = await IAPManager.getStoredTier();
      setLicenseTier(tier.tier as LicenseTier);
      setTrialStart(tier.updatedAt || Date.now());
      Alert.alert(t('status_success'), t('status_premium_unlocked'));
      try {
        await handleSync();
      } catch (err) {
        console.warn('Sync after purchase failed', err);
      }
    };

    const initIAP = async () => {
      await IAPManager.init(handlePurchaseSuccess);
      const tier = await IAPManager.getStoredTier();
      setLicenseTier(tier.tier as LicenseTier);
      setTrialStart(tier.updatedAt || Date.now());
      const prods = await IAPManager.getProducts();
      setProducts(prods);
    };
    initIAP();
    return () => { IAPManager.endConnection(); };
  }, []);

  const handleWebAuth = async () => {
    setStatus(t('status_repairing') || 'Starting connection repair...');
    try {
      const iosClientId = '39865597076-qeun10r8fooabrf6vs7buac4l3ti1nrm.apps.googleusercontent.com';
      const webClientId = '39865597076-oog6m7m50i99be0c27u4j40f6f0unf9q.apps.googleusercontent.com';
      const clientId = Platform.OS === 'ios' ? iosClientId : webClientId;
      
      // 關鍵修正：Google Web Auth 要求 redirectUri 必須完全符合 iOS Client ID 的反向 Scheme
      // 若是原生 iOS，必須手動指定 com.googleusercontent.apps.XXX:/
      const redirectUri = Platform.OS === 'ios' 
        ? `com.googleusercontent.apps.39865597076-qeun10r8fooabrf6vs7buac4l3ti1nrm:/`
        : AuthSession.makeRedirectUri();

      console.log('[PAC] Redirect URI:', redirectUri);


      const discovery = {
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
        revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
      };

      const request = new AuthSession.AuthRequest({
        clientId,
        scopes: ['email', 'https://www.googleapis.com/auth/drive.appdata'],
        redirectUri,
        responseType: AuthSession.ResponseType.Token,
        usePKCE: false, 
      });

      const result = await request.promptAsync(discovery);

      if (result.type === 'success' && result.params.access_token) {
        const token = result.params.access_token;
        await SecureStore.setItemAsync('google_drive_token', token);
        await SecureStore.setItemAsync('pv_google_access_token', token);
        Alert.alert(t('status_success') || 'Success', t('google_login_success_sync') || 'Successfully signed in to Google. Please press sync again.');
        setSyncStatus(t('google_logged_in_sync') || 'Signed in. Synchronizing...');
      } else {
        console.log('[PAC] Web Auth Result:', result.type);
        if (result.type === 'error') {
           Alert.alert(t('web_auth_err') || 'Web Auth Error', result.error?.message || t('err_unknown') || 'Unknown error');
        }
      }
    } catch (err: any) {
      Alert.alert(t('web_auth_err') || 'Web Auth Error', err.message);
    }
    setStatus('');
  };



  const triggerAutoSync = useCallback(async () => {
    setSyncStatus(t('status_auto_syncing'));
    try {
      const localCats = categories;
      const result = await syncEngineRef.current!.sync(masterPwdRef.current, [], localCats);
      
      // [PAC] Manual Category Sync Override: LWW Comparison
      const mergedCatsPayload = await syncCategories(localCats);
      if (mergedCatsPayload) {
        await saveCategories(mergedCatsPayload.categories, mergedCatsPayload.updatedAt, false);
      }

      // Update local license if remote is more advanced
      if (result.remoteLicenseTier && result.remoteLicenseTier !== licenseTier) {
        await IAPManager.setStoredTier(result.remoteLicenseTier, result.remoteLicenseUpdatedAt);
        setLicenseTier(result.remoteLicenseTier as LicenseTier);
      }

      setSyncStatus(`Cloud Updated (${result.pushed} items)`);
      await loadItems();
      setTimeout(() => setSyncStatus(''), 3000);
    } catch (e: any) {
      if (e.message === 'SIGN_IN_REQUIRED') {
        // 背景自動同步：未登入時靜默跳過，不顯示任何錯誤
        setSyncStatus('');
        return;
      }
      if (e.message.includes('401') || e.message.includes('UNAUTHENTICATED')) {
        setSyncStatus(t('cloud_expired_msg'));
      } else {
        setSyncStatus(`Sync Pending...`);
      }
    }
  }, [loadItems, categories, saveCategories, syncCategories]);

  // Set the triggerAutoSyncRef to ensure saveCategories can invoke it safely
  useEffect(() => {
    triggerAutoSyncRef.current = triggerAutoSync;
  }, [triggerAutoSync]);

  // [PAC]：解鎖成功後立即觸發一次同步
  const lastAppState = useRef(appState);
  useEffect(() => {
    if (lastAppState.current !== 'UNLOCKED' && appState === 'UNLOCKED' && masterPwdRef.current) {
      console.log('[PAC] Just unlocked, triggering initial sync...');
      triggerAutoSync();
    }
    lastAppState.current = appState;
  }, [appState, triggerAutoSync]);

  // Onboarding 引導流程
  useEffect(() => {
    if (appState !== 'UNLOCKED' || !setupGuideStep) return;

    if (setupGuideStep === 'NEED_GOOGLE_PROMPT') {
      Alert.alert(
        t('guide_google_title'),
        t('guide_google_desc'),
        [
          {
            text: t('cancel_btn'),
            style: 'cancel',
            onPress: () => {
              setSetupGuideStep(null);
            }
          },
          {
            text: t('ok_btn'),
            onPress: async () => {
              try {
                setSyncStatus(t('status_syncing'));
                await cloudProviderRef.current!.authenticate(true);
                await handleSync();
              } catch (authErr: any) {
                console.log('[PAC] Google auth guide error:', authErr);
                if (authErr.message === 'SIGN_IN_CANCELLED') {
                  setSyncStatus('');
                } else if (authErr.message === 'TOKEN_EMPTY_AFTER_RETRIES') {
                  handleWebAuth();
                } else {
                  setSyncStatus(t('err_login_failed').replace('{error}', authErr.message));
                }
              }
            }
          }
        ],
        { cancelable: false }
      );
    } else if (setupGuideStep === 'NEED_AUTOFILL_PROMPT') {
      Alert.alert(
        t('guide_autofill_title'),
        t('guide_autofill_desc'),
        [
          {
            text: t('ok_btn'),
            onPress: async () => {
              await pvStore.set('pv_setup_guide_step', 'COMPLETED');
              setSetupGuideStep('COMPLETED');
            }
          }
        ],
        { cancelable: false }
      );
    }
  }, [appState, setupGuideStep]);

  // --- 定時背景輪詢 (每 30 秒) ---
  useEffect(() => {
    // [PAC 安全停火]：暫時關閉背景自動同步，以防止在匯入敏感資料時發生競態衝突。
    // 所有同步改為手動觸發。
    /*
    let timer: NodeJS.Timeout;
    if (appState === 'UNLOCKED' && masterPwdRef.current) {
      timer = setInterval(() => {
        console.log('[PAC] Polling for cloud updates...');
        triggerAutoSync();
      }, 30000);
    }
    return () => { if (timer) clearInterval(timer); };
    */
  }, [appState, triggerAutoSync]);
  
  const handleForceWipeCloud = async () => {
    Alert.alert(t('label_danger_zone'), t('wipe_confirm'), [
      { text: t('close_btn'), style: 'cancel' },
      { 
        text: t('opt_wipe_cloud'), 
        style: 'destructive', 
        onPress: async () => {
          setSyncStatus(t('status_syncing'));
          try {
            await cloudProviderRef.current!.authenticate(true);
            const rawItems = await vaultManagerRef.current!.getRawItems();
            // [PAC 物理清理]：Wipe 時剔除所有墓碑，僅保留活著的資料
            const activeOnly = rawItems.filter(i => !i.deleted);
            const localSalt = await (vaultManagerRef.current! as any).getSalt();
            const localInfo = await (vaultManagerRef.current! as any).getLicenseInfo?.();
            await cloudProviderRef.current!.pushData({
              salt: localSalt || '',
              items: activeOnly,
              licenseTier: localInfo?.tier,
              licenseUpdatedAt: localInfo?.updatedAt || Date.now(),
              isWiped: activeOnly.length === 0
            });
            await loadItems(); // 強制刷新本地與診斷筆數
            setSyncStatus('Cloud Wiped OK');
            Alert.alert(t('status_success'), t('wipe_success'));
            setTimeout(() => setSyncStatus(''), 3000);
          } catch (e: any) {
            setSyncStatus(`Wipe Error: ${e.message}`);
            Alert.alert(t('wipe_err_t'), e.message);
          }
        }
      }
    ]);
  };

  const handleCloudLogout = async () => {
    try {
      await cloudProviderRef.current!.logout();
      Alert.alert(t('cloud_logout_t'), t('cloud_logout_msg'));
      setSyncStatus('Cloud Logout OK');
    } catch (e: any) {
      Alert.alert(t('logout_err_t'), e.message);
    }
  };

  const handleImportCSV = async () => {
    if (isPickingRef.current) {
      return;
    }
    isPickingRef.current = true;
    setStatus(t('status_syncing'));
    try {
      const result = await DocumentPicker.getDocumentAsync({ 
        type: '*/*',
        copyToCacheDirectory: true 
      });
      
      if (result.canceled) { 
        setStatus(''); 
        return; 
      }
      const asset = result.assets[0];
      
      // Memory Safety: Check size (Limit to 20MB)
      if (asset.size && asset.size > 20 * 1024 * 1024) {
        Alert.alert(t('import_err_t'), t('err_csv_large') || "CSV too large (Max 20MB).");
        setStatus('');
        return;
      }

      setStatus(t('status_syncing'));
      const content = await new File(asset.uri).text();
      const parsedItems = CSVProcessor.parseCSV(content);
      if (parsedItems.length === 0) {
        Alert.alert(t('import_err_t'), t('err_csv_invalid') || "No valid items found in CSV.");
        return;
      }

      const importedCategories = [...categories];
      let categoriesChanged = false;
      parsedItems.forEach(item => {
        if (!item.category || !item.categoryName) return;
        if (importedCategories.some(category => category.id === item.category)) return;
        importedCategories.push({ id: item.category, name: item.categoryName });
        categoriesChanged = true;
      });
      if (categoriesChanged) {
        await saveCategories(importedCategories, Date.now(), false);
      }

      const vault = vaultManagerRef.current!;
      if (typeof vault.addEntries === 'function') {
        await vault.addEntries(parsedItems.map(item => ({
          id: item.id,
          serviceName: item.serviceName!,
          username: item.username!,
          secretPayload: item.secretPayload!,
          category: item.category,
          updated_at: item.updated_at,
          version: item.version,
          type: item.type
        })));
      } else {
        // [PAC Fallback] 針對未同步編譯的環境降級處理
        for (const item of parsedItems) {
          await vault.addEntry(
            item.serviceName || 'Imported',
            item.username || '',
            item.secretPayload || { password: '' }
          );
        }
        // 強制寫入墓碑標記修復 (針對舊版 addEntry)
        const allRaw = await vault.getRawItems();
        const needsFix = allRaw.filter(i => i.deleted === undefined);
        if (needsFix.length > 0) {
          const fixed = allRaw.map(i => ({ ...i, deleted: false }));
          await (vault as any).storageProvider.saveBatch(fixed);
        }
      }
      
      Alert.alert(t('status_success'), t('import_success_d').replace('{count}', parsedItems.length.toString()));
      loadItems();
      setStatus('');
    } catch (e: any) { 
      setStatus(`${t('import_err_t')}: ${e.message}`);
      Alert.alert(t('import_err_t'), e.message); 
    } finally {
      isPickingRef.current = false;
    }
  };

  const handleImportShared = async () => {
    Alert.alert(t('feature_coming_soon'), t('import_shared_optimized'));
  };

  const handleExportCSV = async () => {
    setStatus(t('status_syncing'));
    try {
      const result = await vaultManagerRef.current!.getDecryptedItems();
      const csv = CSVProcessor.exportToCSV(result.items, categories);
      const exportFile = new File(Paths.cache, 'vault_export.csv');
      exportFile.write(csv);
      await Sharing.shareAsync(exportFile.uri);
      setStatus('');
    } catch (e: any) { 
      setStatus(`${t('export_fail_t')}: ${e.message}`);
      Alert.alert(t('export_fail_t'), e.message); 
    }
  };

  const handleExit = async () => {
    await vaultManagerRef.current!.lockVault();
    setAppState('LOCKED');
    setMasterPassword('');
  };

  const toggleBiometric = async () => {
    try {
      if (biometricAvailable) {
        await SecureStore.deleteItemAsync(BIOMETRIC_KEY);
        await pvStore.set('pv_biometric_disabled', 'true');
        await pvStore.set('pv_biometric_enabled', 'false');
        setBiometricAvailable(false);
        Alert.alert(t('status_success'), t('bio_disabled_msg'));
      } else {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (!hasHardware || !isEnrolled) {
          Alert.alert(t('bio_setup_req_t'), t('bio_setup_req_d'));
          return;
        }

        const pwd = masterPwdRef.current;
        if (!pwd) {
          Alert.alert(t('status_error'), t('master_key_placeholder'));
          return;
        }
        await SecureStore.setItemAsync(BIOMETRIC_KEY, pwd, LOCAL_STORE_OPTS);
        await pvStore.set('pv_biometric_disabled', 'false');
        await pvStore.set('pv_biometric_enabled', 'true');
        setBiometricAvailable(true);
        Alert.alert(t('status_success'), t('bio_enabled_msg'));
      }
    } catch (e: any) {
      Alert.alert(t('bio_err_t'), t('bio_err_t') + ': ' + e.message);
    }
  };


  const openEditForm = (item: any) => {
    setEditingId(item.id);
    setNewService(item.serviceName);
    setNewUsername(item.username);
    setItemCat(item.category || 'personal');
    
    if (item.secretPayload.cardNumber) {
      setCardType('CARD');
      setCardholder(item.secretPayload.cardholderName || item.username || '');
      
      const fullNum = item.secretPayload.cardNumber || '';
      setCardNumber1(fullNum.slice(0, 4));
      setCardNumber2(fullNum.slice(4, 8));
      setCardNumber3(fullNum.slice(8, 12));
      setCardNumber4(fullNum.slice(12, 16));
      
      setExpiry(item.secretPayload.expiryDate || '');
      setCvv(item.secretPayload.cvv || '');
      setCardBrand(item.secretPayload.brand || 'Unknown');
      setNewNotes(item.secretPayload.notes || '');
    } else {
      setCardType('PASSWORD');
      setNewPassword(item.secretPayload.password || '');
      setNewTotp(item.secretPayload.totpSecret || '');
      setNewUrl(item.secretPayload.url || '');
      setNewNotes(item.secretPayload.notes || '');
    }
    setViewMode('EDIT');
  };

  const toggleVisibility = (id: string) => setRevealedItems(p => ({ ...p, [id]: !p[id] }));
  const toggleCvvVisibility = (id: string) => setRevealedCvv(p => ({ ...p, [id]: !p[id] }));

  const generatePassword = () => setNewPassword(PasswordGenerator.generate(genConfig));


  const filtered = (items || [])
    .filter(i => {
      if (!i || !i.serviceName || !i.secretPayload) return false;
      const q = searchQuery.trim().toLowerCase();
      
      // 類型過濾 (PASSWORD / CARD)
      const isCard = !!i.secretPayload.cardNumber;
      if (activeTab === 'PASSWORD' && isCard) return false;
      if (activeTab === 'CARD' && !isCard) return false;

      // 類別過濾
      if (selectedCat !== 'ALL' && activeTab === 'PASSWORD') {
        if (!isCard) {
          const cat = i.category || 'Personal';
          if (selectedCat === 'UNGROUPED') {
             if (i.category && i.category !== 'Personal') return false; 
          } else if (i.category !== selectedCat) {
             return false;
          }
        }
      }

      // 先處理安全過濾器
      if (activeFilter !== 'NONE') {
        if (activeFilter === 'WEAK' && !isWeakPassword(i.secretPayload.password || '')) return false;
        if (activeFilter === 'REUSED') {
          const allPwds = items.map(x => x.secretPayload.password).filter(Boolean);
          const count = allPwds.filter(p => p === i.secretPayload.password).length;
          if (count <= 1) return false;
        }
        if (activeFilter === 'LEAKED' && !breachedIds[i.id]) return false;
      }

      if (!q) return true;
      const sName = (i.serviceName || '').toLowerCase();
      const uName = (i.username || '').toLowerCase();
      return sName.includes(q) || uName.includes(q);
    })
    .slice()
    .sort((a, b) => {
      if (sortBy === 'name') return a.serviceName.localeCompare(b.serviceName);
      if (sortBy === 'newest') return (b.updatedAt || 0) - (a.updatedAt || 0);
      if (sortBy === 'oldest') return (a.updatedAt || 0) - (b.updatedAt || 0);
      return 0;
    });

  const stats = useMemo(() => AIGuard.calculateScore(items, Object.keys(breachedIds).length), [items, breachedIds]);
  const aiAdvice = useMemo(() => AIGuard.analyzeRisk(items), [items]);



  if (appState === 'LOADING') {
    return (
      <SafeAreaView style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={C.yellow} size="large" />
        <Text style={{ color: C.yellow, marginTop: 20, fontFamily: 'Courier New' }}>SYSTEM INITIALIZING...</Text>
        <TouchableOpacity style={{ marginTop: 40 }} onPress={() => setAppState('SETUP')}>
          <Text style={{ color: C.dim, fontSize: 10 }}>[SKIP TO SETUP IF STUCK]</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }


  if ((appState === 'SETUP' || appState === 'LOCKED') && viewMode === 'LIST') {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: C.bg }]}>
        <StatusBar barStyle={appTheme === 'light' ? "dark-content" : "light-content"} backgroundColor={C.bg} />
        
        <View style={s.body}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, zIndex: 5000 }}>
            <Text style={[s.section, { marginBottom: 0, fontSize: 18 }]}>
              {t(appState === 'SETUP' ? 'setup_title' : 'unlock_title')}
            </Text>
            <View style={{ position: 'relative' }}>
              <HeaderIconButton 
                name="menu" 
                color={C.yellow}
                onPress={() => setShowMenu(!showMenu)} 
              />
              {showMenu && (
                <View style={{ 
                  position: 'absolute', top: 40, right: 0, 
                  backgroundColor: C.panel, borderWidth: 1, borderColor: C.border,
                  borderRadius: 12, padding: 8, width: 180,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 15, elevation: 20,
                  zIndex: 9999
                }}>
                  <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: C.border }} onPress={() => { setShowMenu(false); setViewMode('MANUAL'); }}>
                    <Ionicons name="book" size={20} color="#2196F3" style={{ marginRight: 12 }} />
                    <Text style={{ color: C.text, fontSize: 13 }}>{t('manual_title')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }} onPress={() => { setShowMenu(false); setAppTheme(p => p === 'dark' ? 'light' : 'dark'); }}>
                    <Ionicons name={appTheme === 'dark' ? "sunny" : "moon"} size={20} color="#FFC107" style={{ marginRight: 12 }} />
                    <Text style={{ color: C.text, fontSize: 13 }}>{t('opt_theme')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
          
          <View style={{ width: '100%', marginBottom: 15 }}>
            <View style={{ position: 'relative' }}>
              <TextInput 
                style={[s.input, { marginBottom: 0, paddingRight: 80 }]} 
                secureTextEntry={!showMasterKey} 
                placeholder={t('master_key_placeholder')} 
                placeholderTextColor={C.dim} 
                value={masterPassword} 
                onChangeText={setMasterPassword} 
              />
              <View style={{ position: 'absolute', right: 8, top: 10, flexDirection: 'row', gap: 8 }}>
                {masterPassword.length > 0 && (
                  <TouchableOpacity onPress={() => setMasterPassword('')}>
                    <Text style={[s.tag, { color: C.dim }]}>✕</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setShowMasterKey(!showMasterKey)}>
                  <Text style={s.tag}>{t(showMasterKey ? 'hide_pwd' : 'show_pwd')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {appState === 'SETUP' && (
            <TextInput 
              style={[s.input, ]} 
              secureTextEntry 
              placeholder={t('confirm_key_placeholder')} 
              placeholderTextColor={C.dim} 
              value={confirmPassword} 
              onChangeText={setConfirmPassword} 
            />
          )}

          <TouchableOpacity style={s.btn} onPress={appState === 'SETUP' ? handleSetup : handleUnlock} disabled={isLoading}>
            <Text style={s.btnText}>{t(appState === 'SETUP' ? 'initialize_btn' : 'unlock_btn')}</Text>
          </TouchableOpacity>

          {appState === 'LOCKED' && biometricAvailable && (
            <TouchableOpacity style={[s.btn, { backgroundColor: C.border, marginTop: 10 }]} onPress={handleBiometricUnlock}>
              <Text style={[s.btnText, { color: C.yellow }]}>{t('biometric_btn')}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={{ marginTop: 40 }} onPress={() => setViewMode('LANG_PICKER')}>
            <Text style={{ color: C.dim, fontSize: 14 }}>{t('lang_btn')}: {languages.find((x: any) => x.code === lang)?.flag} {languages.find((x: any) => x.code === lang)?.label}</Text>
          </TouchableOpacity>

          {!!status && <Text style={s.statusText}>{status}</Text>}

          {status.includes('Invalid') && (
            <TouchableOpacity 
              style={[s.btn, { backgroundColor: C.red, marginTop: 20 }]} 
              onPress={handleEmergencyReset}
            >
              <Text style={s.btnText}>⚠️ {t('diag_run_reset') || '強制重設 (切換至穩定架構)'}</Text>
            </TouchableOpacity>
          )}

          {!!status && showRepairHint && (
            <TouchableOpacity 
              style={{ backgroundColor: 'rgba(255, 193, 7, 0.15)', padding: 16, borderRadius: 12, marginTop: 20, borderWidth: 1, borderColor: C.yellow }}
              onPress={() => setViewMode('DIAGNOSTIC')}
            >
              <Text style={{ color: C.yellow, fontSize: 14, fontWeight: 'bold', textAlign: 'center' }}>✨ {t('diag_smart_hint')}</Text>
              <Text style={{ color: C.dim, fontSize: 11, textAlign: 'center', marginTop: 4 }}>{t('doc_manual_repair_d').split('。')[0]}。</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const renderLicenseBanner = () => {
    if (!activeLicense) return null;
    const isTrial = activeLicense.tier === 'trial';
    const isExpired = activeLicense.tier === 'expired';
    const isPro = activeLicense.tier === 'pro' || activeLicense.tier === 'lifetime';

    if (isPro) return null;

    const daysLeft = Math.ceil((activeLicense.trialStartedAt + 14 * 24 * 60 * 60 * 1000 - Date.now()) / (24 * 60 * 60 * 1000));
    const isOneDayLeft = daysLeft === 1;

    return (
      <View style={{ backgroundColor: isExpired ? '#3a1a1a' : (isOneDayLeft ? '#3a2a1a' : '#1a2a3a'), padding: 15, borderRadius: 12, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: isExpired ? C.red : (isOneDayLeft ? C.yellow : C.blue) }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={{ color: C.text, fontWeight: 'bold', fontSize: 14 }}>
              {isExpired ? t('license_expired') : (isOneDayLeft ? t('trial_warning_t') : t('license_trial').replace('{{days}}', daysLeft.toString()))}
            </Text>
            <Text style={{ color: C.dim, fontSize: 11, marginTop: 4 }}>
              {isExpired ? t('limit_reached_d') : (isOneDayLeft ? t('trial_warning_d') : t('upgrade_msg'))}
            </Text>
          </View>
          <TouchableOpacity 
            style={{ backgroundColor: C.yellow, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 }}
            onPress={async () => {
              try {
                const success = await IAPManager.requestPurchase('com.cloudpassword.lifetime');
                if (success) {
                  setLicenseTier('lifetime');
                  await IAPManager.setStoredTier('lifetime');
                  Alert.alert(t('status_success'), t('status_premium_unlocked'));
                  await handleSync();
                } else {
                  Alert.alert(t('status_error'), 'Purchase failed.');
                }
              } catch (err: any) {
                Alert.alert(t('status_error'), `Purchase failed: ${err.message || err}`);
              }
            }}
          >
            <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 11 }}>{t('upgrade_btn')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderLicenseBlock = () => {
    if (!activeLicense || activeLicense.tier !== 'expired') return null;
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center', zIndex: 20000, padding: 30 }]}>
        <View style={{ backgroundColor: C.panel, padding: 30, borderRadius: 20, borderWidth: 1, borderColor: C.red, width: '100%', alignItems: 'center' }}>
          <Text style={{ fontSize: 40, marginBottom: 20 }}>🔒</Text>
          <Text style={{ color: C.red, fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 15 }}>{t('license_block_t')}</Text>
          <Text style={{ color: C.text, fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 30 }}>{t('license_block_d')}</Text>
          
          <TouchableOpacity 
            style={{ backgroundColor: C.yellow, paddingVertical: 18, width: '100%', borderRadius: 12, alignItems: 'center', marginBottom: 15 }}
            onPress={async () => {
              try {
                const success = await IAPManager.requestPurchase('com.cloudpassword.lifetime');
                if (success) {
                  setLicenseTier('lifetime');
                  await IAPManager.setStoredTier('lifetime');
                  Alert.alert(t('status_success'), t('status_premium_unlocked'));
                  await handleSync();
                } else {
                  Alert.alert(t('status_error'), 'Purchase failed.');
                }
              } catch (err: any) {
                Alert.alert(t('status_error'), `Purchase failed: ${err.message || err}`);
              }
            }}
          >
            <Text style={{ color: '#000', fontSize: 16, fontWeight: 'bold' }}>{t('license_block_btn')}</Text>
          </TouchableOpacity>



          <TouchableOpacity style={{ marginTop: 25 }} onPress={handleEmergencyReset}>
            <Text style={{ color: 'rgba(255, 100, 100, 0.6)', fontSize: 13, textDecorationLine: 'underline' }}>{t('opt_emergency_reset')}</Text>
          </TouchableOpacity>

          {/* --- Version Display in Block Screen --- */}
          <View style={{ marginTop: 40 }}>
            <Text style={{ color: 'rgba(255,255,255,0.1)', fontSize: 10 }}>v1.0.0-PROD (SDK54)</Text>
          </View>
        </View>
      </View>
    );
  };

  // --- 分類選擇器彈出視窗 ---
  const renderCategoryPicker = () => {
    if (!showCatPickerId) return null;
    return (
      <TouchableOpacity 
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}
        onPress={() => setShowCatPickerId(null)}
      >
        <View style={{ width: '80%', backgroundColor: C.panel, borderRadius: 12, padding: 20, borderWidth: 1, borderColor: C.yellow }}>
          <Text style={{ color: C.yellow, fontSize: 16, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' }}>{t('cat_label')}</Text>
          <ScrollView>
            {categories.map(cat => (
              <TouchableOpacity 
                key={cat.id} 
                onPress={() => handleQuickCatChange(showCatPickerId, cat.id)}
                style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border }}
              >
                <Text style={{ color: C.text, textAlign: 'center' }}>{t(`cat_${cat.id}`) === `cat_${cat.id}` ? cat.name : t(`cat_${cat.id}`)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity onPress={() => setShowCatPickerId(null)} style={{ marginTop: 20, padding: 12, alignItems: 'center' }}>
            <Text style={{ color: C.dim }}>{t('cancel_btn')}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };


  const renderOnboarding = () => {
    if (!showOnboarding) return null;
    return (
      <View style={s.onboardOverlay}>
        <View style={s.onboardCard}>
          <View style={s.onboardIconContainer}>
            <Image source={require('../../assets/icon_3d_lock.png')} style={s.onboardIcon} resizeMode="contain" />
          </View>
          <Text style={s.onboardTitle}>{t('onboard_welcome')}</Text>
          <Text style={s.onboardDesc}>{t('onboard_desc')}</Text>
          <TouchableOpacity style={s.onboardBtn} onPress={() => { setShowOnboarding(false); SecureStore.setItemAsync('pv_onboarded', 'true'); }}>
            <Text style={s.onboardBtnText}>{t('onboard_start')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  try {
    return (
      <SafeAreaView style={s.container}>
        <StatusBar barStyle={appTheme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={C.bg} />
        {renderCategoryPicker()}
        {isLoading && <ActivityIndicator size="large" color={C.yellow} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, backgroundColor: C.bg }} />}
        
        {/* --- Header (LIST Mode) --- */}
        {viewMode === 'LIST' && (
          <View style={[s.header, { paddingHorizontal: 12, backgroundColor: 'transparent', borderBottomWidth: 0, paddingVertical: 10, zIndex: 2000 }]}>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Text style={[s.headerTitle, { fontSize: 16 }]} numberOfLines={1}>
                {t('vault_title')} ({items.length})
                {failedDecryptionCount > 0 && (
                  <Text style={{ color: '#FF4444', fontSize: 12 }}>
                    {' '} ({failedDecryptionCount} {t('decrypt_failed_label') || 'Decrypt Fail'})
                  </Text>
                )}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, zIndex: 3000 }}>
                <TouchableOpacity 
                  onPress={() => setShowSortPicker(!showSortPicker)}
                  style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12 }}
                >
                  <Text style={{ color: C.yellow, fontSize: 10, fontWeight: 'bold' }}>⇅ {t(`sort_${sortBy}`).split(' (')[0].toUpperCase()} ▾</Text>
                </TouchableOpacity>

                {activeFilter !== 'NONE' && (
                  <TouchableOpacity onPress={() => setActiveFilter('NONE')}>
                    <Text style={{ color: C.red, fontSize: 10, fontWeight: 'bold' }}>✕ {t('opt_clear_filter')}</Text>
                  </TouchableOpacity>
                )}

                {showSortPicker && (
                  <View style={{ 
                    position: 'absolute', top: 20, left: 0, 
                    backgroundColor: C.panel, borderWidth: 1, borderColor: C.border,
                    borderRadius: 8, padding: 4, width: 140, 
                    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 10,
                    zIndex: 9999
                  }}>
                    {[
                      { id: 'name', label: t('sort_name') },
                      { id: 'newest', label: t('sort_newest') },
                      { id: 'oldest', label: t('sort_oldest') }
                    ].map(opt => (
                      <TouchableOpacity 
                        key={opt.id} 
                        style={{ padding: 8, backgroundColor: sortBy === opt.id ? 'rgba(255,193,7,0.1)' : 'transparent', borderRadius: 4 }}
                        onPress={() => { setSortBy(opt.id as any); setShowSortPicker(false); }}
                      >
                        <Text style={{ color: sortBy === opt.id ? C.yellow : C.text, fontSize: 10, fontWeight: sortBy === opt.id ? 'bold' : 'normal' }}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>
            <View style={{ position: 'relative', zIndex: 5000 }}>
              <HeaderIconButton name="menu" color={C.yellow} onPress={() => setShowMenu(!showMenu)} />
              
              {showMenu && (
                <View style={{ 
                  position: 'absolute', top: 40, right: 0, 
                  backgroundColor: C.panel, borderWidth: 1, borderColor: C.border,
                  borderRadius: 12, padding: 8, width: 180,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 15, elevation: 20,
                  zIndex: 9999
                }}>
                  <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: C.border }} onPress={() => { setShowMenu(false); if (activeLicense && !LicenseManager.canAddMore(items.length, activeLicense)) { Alert.alert(t('limit_reached_t'), t('limit_reached_d')); return; } clearForm(); setCardType('PASSWORD'); setViewMode('ADD'); }}>
                    <Ionicons name="add-circle" size={20} color="#4CAF50" style={{ marginRight: 12 }} />
                    <Text style={{ color: C.text, fontSize: 13 }}>{t('add_btn')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: C.border }} onPress={() => { setShowMenu(false); setAppTheme(p => p === 'dark' ? 'light' : 'dark'); }}>
                    <Ionicons name="contrast" size={20} color="#FFC107" style={{ marginRight: 12 }} />
                    <Text style={{ color: C.text, fontSize: 13 }}>{t('opt_theme')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: C.border }} onPress={() => { setShowMenu(false); setViewMode('MANUAL'); }}>
                    <Ionicons name="book" size={20} color="#2196F3" style={{ marginRight: 12 }} />
                    <Text style={{ color: C.text, fontSize: 13 }}>{t('manual_title')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: C.border }} onPress={() => { setShowMenu(false); setViewMode('SETTINGS'); }}>
                    <Ionicons name="settings" size={20} color="#9E9E9E" style={{ marginRight: 12 }} />
                    <Text style={{ color: C.text, fontSize: 13 }}>{t('key_btn')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }} onPress={() => { setShowMenu(false); handleExit(); }}>
                    <Ionicons name="log-out" size={20} color={C.red} style={{ marginRight: 12 }} />
                    <Text style={{ color: C.red, fontSize: 13 }}>{t('opt_logout')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        )}

        {renderOnboarding()}

        {/* --- Navigation Header (Non-LIST) --- */}
        {viewMode !== 'LIST' && (() => {
          const backToSettings = (['LANG_PICKER', 'DATA_MANAGE', 'CHANGE_KEY'].includes(viewMode));
          const titleMap: any = { SETTINGS: t('key_btn').replace('⚙️ ', '').toUpperCase(), LANG_PICKER: t('opt_lang'), DATA_MANAGE: t('cat_data'), ADD: t('add_btn'), EDIT: t('edit_btn'), CHANGE_KEY: t('opt_change_key'), MANUAL: t('manual_title'), MANAGE_CATS: t('manage_cats') };
          return (
            <View style={[s.header, { backgroundColor: C.panel, borderBottomColor: C.border, paddingVertical: 10 }]}>
              <TouchableOpacity onPress={() => backToSettings ? setViewMode('SETTINGS') : setViewMode('LIST')} style={{ padding: 10 }}>
                <Text style={{ color: C.yellow, fontSize: 14 }}>← {t('back_btn')}</Text>
              </TouchableOpacity>
              <Text style={{ color: C.text, fontSize: 16, fontWeight: 'bold' }}>{titleMap[viewMode] || ''}</Text>
              <TouchableOpacity onPress={() => backToSettings ? setViewMode('SETTINGS') : setViewMode('LIST')} style={{ padding: 10 }}>
                <Text style={{ color: C.red, fontSize: 14 }}>{t('close_btn')} ✕</Text>
              </TouchableOpacity>
            </View>
          );
        })()}

        {/* --- LIST Mode --- */}
        {viewMode === 'LIST' && (
          <View style={{ flex: 1, paddingHorizontal: 16 }}>
            <TextInput style={[s.input, { marginBottom: 12 }]} placeholder={t('search_placeholder')} placeholderTextColor={C.dim} value={searchQuery} onChangeText={setSearchQuery} />
            <View style={{ flexDirection: 'row', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
              {(['ALL', 'PASSWORD', 'CARD'] as const).map(tab => (
                <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={[{ paddingHorizontal: 16, paddingVertical: 10 }, activeTab === tab && { borderBottomWidth: 2, borderBottomColor: C.yellow }]}>
                  <Text style={{ color: activeTab === tab ? C.yellow : C.dim, fontWeight: 'bold', fontSize: 13 }}>
                    {tab === 'ALL' ? t('tab_all') : (tab === 'PASSWORD' ? t('tab_pwd') : t('tab_card'))}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {activeTab === 'PASSWORD' && (
              <View style={{ marginBottom: 12 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <TouchableOpacity onPress={() => setSelectedCat('ALL')} style={[s.tab, selectedCat === 'ALL' && s.tabActive]}><Text style={[s.tabText, selectedCat === 'ALL' && s.tabTextActive]}>{t('all_cats')}</Text></TouchableOpacity>
                  {categories.map(cat => (
                    <TouchableOpacity key={cat.id} onPress={() => setSelectedCat(cat.id)} style={[s.tab, selectedCat === cat.id && s.tabActive]}>
                      <Text style={[s.tabText, selectedCat === cat.id && s.tabTextActive]}>
                        {t(`cat_${cat.id}`) === `cat_${cat.id}` ? cat.name : t(`cat_${cat.id}`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            <FlatList
              data={filtered}
              keyExtractor={i => i.id}
              renderItem={({ item, index }) => (
                <View style={s.card}>
                  <View style={s.accent} />
                  <View style={{ flex: 1, padding: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        <Image source={{ uri: `https://www.google.com/s2/favicons?sz=64&domain=${(item.serviceName || 'vault').toLowerCase()}.com` }} style={{ width: 24, height: 24, borderRadius: 4, marginRight: 10 }} />
                        <Text style={s.cardTitle} numberOfLines={1}>
                          <Text style={{ color: C.yellow, fontWeight: 'bold' }}>#{index + 1} </Text>
                          {item.serviceName || t('label_unknown')}
                        </Text>
                        {breachedIds[item.id] && <View style={{ backgroundColor: 'rgba(244,67,54,0.1)', paddingHorizontal: 6, borderRadius: 4, marginLeft: 8 }}><Text style={{ color: C.red, fontSize: 8 }}>{t('sec_leaked').toUpperCase()}</Text></View>}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity onPress={() => openEditForm(item)}><Text style={s.link}>{t('edit_btn')}</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDelete(item.id, item.serviceName || t('label_unknown'))}><Text style={[s.link, { color: C.red }]}>{t('delete_btn')}</Text></TouchableOpacity>
                      </View>
                    </View>
                    {!!item.username && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 }}>
                        <Text style={[s.dim, { marginBottom: 0, flex: 1 }]} numberOfLines={1}>{item.username}</Text>
                        <TouchableOpacity onPress={() => copy(item.username, t('username_label'))}>
                          <Text style={s.tag}>{t('label_copy')}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    
                    {item.secretPayload?.url && (
                      <TouchableOpacity onPress={() => Linking.openURL(item.secretPayload.url)} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                        <Text style={{ color: C.blue, fontSize: 11 }} numberOfLines={1}>🔗 {item.secretPayload.url}</Text>
                      </TouchableOpacity>
                    )}

                    {item.secretPayload?.cardNumber ? (
                      <View style={{ marginTop: 8, gap: 6, backgroundColor: C.panel, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: C.border }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={{ color: C.dim, fontSize: 10 }}>{t('credit_card_number_label')}</Text>
                            <Text style={{ color: C.text, fontFamily: 'Courier New', fontSize: 14, fontWeight: 'bold', marginTop: 2 }}>
                              {revealedItems[item.id] 
                                ? (item.secretPayload.cardNumber.match(/.{1,4}/g)?.join(' ') || item.secretPayload.cardNumber)
                                : '•••• •••• •••• ••••'}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity onPress={() => toggleVisibility(item.id)}>
                              <Text style={s.tag}>{revealedItems[item.id] ? t('hide_pwd') : t('show_pwd')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => copy(item.secretPayload.cardNumber || '', t('credit_card_number_label'))}>
                              <Text style={s.tag}>{t('label_copy')}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        {revealedItems[item.id] && (
                          <View style={{ marginTop: 4, gap: 6, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <View>
                                <Text style={{ color: C.dim, fontSize: 10 }}>{t('card_brand_label')}</Text>
                                <Text style={{ color: C.text, fontFamily: 'Courier New', fontSize: 12, fontWeight: 'bold', marginTop: 2 }}>
                                  {item.secretPayload.brand || 'Unknown'}
                                </Text>
                              </View>
                            </View>

                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                              <View style={{ flex: 1, marginRight: 8 }}>
                                <Text style={{ color: C.dim, fontSize: 10 }}>{t('cardholder_name_label')}</Text>
                                <Text style={{ color: C.text, fontFamily: 'Courier New', fontSize: 12, fontWeight: 'bold', marginTop: 2 }}>
                                  {item.secretPayload.cardholderName || 'N/A'}
                                </Text>
                              </View>
                              {!!item.secretPayload.cardholderName && (
                                <TouchableOpacity onPress={() => copy(item.secretPayload.cardholderName || '', t('cardholder_name_label'))}>
                                  <Text style={s.tag}>{t('label_copy')}</Text>
                                </TouchableOpacity>
                              )}
                            </View>

                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: C.dim, fontSize: 10 }}>{t('expiry_date_label')}</Text>
                                <Text style={{ color: C.text, fontFamily: 'Courier New', fontSize: 12, fontWeight: 'bold', marginTop: 2 }}>
                                  {item.secretPayload.expiryDate || 'MM/YY'}
                                </Text>
                              </View>
                              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                                <View style={{ alignItems: 'flex-start' }}>
                                  <Text style={{ color: C.dim, fontSize: 10 }}>{t('cvv_label')}</Text>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                                    <Text style={{ color: C.text, fontFamily: 'Courier New', fontSize: 12, fontWeight: 'bold' }}>
                                      {revealedCvv[item.id] ? (item.secretPayload.cvv || '***') : '•••'}
                                    </Text>
                                    {!!item.secretPayload.cvv && (
                                      <>
                                        <TouchableOpacity onPress={() => toggleCvvVisibility(item.id)}>
                                          <Text style={s.tag}>{revealedCvv[item.id] ? t('hide_pwd') : t('show_pwd')}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => copy(item.secretPayload.cvv || '', t('cvv_label'))}>
                                          <Text style={s.tag}>{t('label_copy')}</Text>
                                        </TouchableOpacity>
                                      </>
                                    )}
                                  </View>
                                </View>
                              </View>
                            </View>
                          </View>
                        )}
                      </View>
                    ) : (
                      <>
                        <View style={s.pwdRow}>
                          <Text style={revealedItems[item.id] ? s.pwdOn : s.pwdOff}>
                            {revealedItems[item.id] ? item.secretPayload?.password : '••••••••'}
                          </Text>
                          <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TouchableOpacity onPress={() => toggleVisibility(item.id)}>
                              <Text style={s.tag}>{revealedItems[item.id] ? t('hide_pwd') : t('show_pwd')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => copy(item.secretPayload?.password || '', t('password_label'))}>
                              <Text style={s.tag}>{t('label_copy')}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        {item.secretPayload?.totpSecret && (
                          <View style={[s.pwdRow, { marginTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', paddingTop: 8 }]}>
                            <View>
                              <Text style={{ color: C.dim, fontSize: 10 }}>{t('totp_label')}</Text>
                              <Text style={{ color: C.yellow, fontSize: 16, letterSpacing: 2, fontWeight: 'bold' }}>
                                {Watchtower.generateTOTP(item.secretPayload.totpSecret)}
                              </Text>
                            </View>
                            <TouchableOpacity onPress={() => copy(Watchtower.generateTOTP(item.secretPayload.totpSecret), t('totp_label'))}>
                              <Text style={s.tag}>{t('label_copy')}</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </>
                    )}

                    {(item.secretPayload?.notes || '').length > 0 && (
                      <View style={{ marginTop: 8, backgroundColor: 'rgba(255,255,255,0.03)', padding: 8, borderRadius: 4 }}>
                        <Text style={{ color: C.dim, fontSize: 11 }} numberOfLines={2}>📝 {item.secretPayload.notes}</Text>
                      </View>
                    )}

                    {!item.secretPayload?.cardNumber && (
                      <View style={{ flexDirection: 'row', marginTop: 10 }}>
                        <TouchableOpacity 
                          onPress={() => setShowCatPickerId(item.id)}
                          style={s.tag}
                        >
                          <Text style={{ color: C.dim, fontFamily: 'Courier New', fontSize: 10 }}>
                            🏷️ {(() => {
                              const catId = item.category || 'ungrouped';
                              const cat = categories.find(c => c.id === catId);
                              if (!cat) return t('cat_ungrouped') || 'Uncategorized';
                              return t(`cat_${cat.id}`) === `cat_${cat.id}` ? cat.name : t(`cat_${cat.id}`);
                            })()}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              )}
            />
          </View>
        )}

        {/* --- ADD/EDIT Mode --- */}
        {(viewMode === 'ADD' || viewMode === 'EDIT') && (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 100}
          >
            <ScrollView
              style={{ flex: 1 }}
              automaticallyAdjustKeyboardInsets={true}
              contentContainerStyle={[s.body, { paddingBottom: 80 }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
            {viewMode === 'ADD' && (
              <View style={{ flexDirection: 'row', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
                <TouchableOpacity onPress={() => setCardType('PASSWORD')} style={[{ flex: 1, paddingVertical: 12, alignItems: 'center' }, cardType === 'PASSWORD' && { borderBottomWidth: 2, borderBottomColor: C.yellow }]}><Text style={{ color: cardType === 'PASSWORD' ? C.yellow : C.dim, fontWeight: 'bold' }}>🔐 {t('password_label')}</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setCardType('CARD')} style={[{ flex: 1, paddingVertical: 12, alignItems: 'center' }, cardType === 'CARD' && { borderBottomWidth: 2, borderBottomColor: C.yellow }]}><Text style={{ color: cardType === 'CARD' ? C.yellow : C.dim, fontWeight: 'bold' }}>💳 {t('tab_card')}</Text></TouchableOpacity>
              </View>
            )}
            <TextInput style={s.input} placeholder={cardType === 'CARD' ? t('issuing_bank') : t('service_name')} placeholderTextColor={C.dim} value={newService} onChangeText={setNewService} />
            
            {cardType === 'CARD' ? (
              <View style={{ gap: 16, marginBottom: 16 }}>
                <View>
                  <Text style={[s.dim, { marginBottom: 6 }]}>
                    {t('credit_card_number_label')}
                  </Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <TextInput
                      ref={cardRef1}
                      style={[s.input, { flex: 1, textAlign: 'center', marginBottom: 0 }]}
                      placeholder="0000"
                      placeholderTextColor={C.dim}
                      value={cardNumber1}
                      onChangeText={(txt) => handleCardNumberChange(txt, 1)}
                      keyboardType="number-pad"
                      maxLength={4}
                    />
                    <TextInput
                      ref={cardRef2}
                      style={[s.input, { flex: 1, textAlign: 'center', marginBottom: 0 }]}
                      placeholder="0000"
                      placeholderTextColor={C.dim}
                      value={cardNumber2}
                      onChangeText={(txt) => handleCardNumberChange(txt, 2)}
                      onKeyPress={(e) => handleCardKeyPress(e, 2)}
                      keyboardType="number-pad"
                      maxLength={4}
                    />
                    <TextInput
                      ref={cardRef3}
                      style={[s.input, { flex: 1, textAlign: 'center', marginBottom: 0 }]}
                      placeholder="0000"
                      placeholderTextColor={C.dim}
                      value={cardNumber3}
                      onChangeText={(txt) => handleCardNumberChange(txt, 3)}
                      onKeyPress={(e) => handleCardKeyPress(e, 3)}
                      keyboardType="number-pad"
                      maxLength={4}
                    />
                    <TextInput
                      ref={cardRef4}
                      style={[s.input, { flex: 1, textAlign: 'center', marginBottom: 0 }]}
                      placeholder="0000"
                      placeholderTextColor={C.dim}
                      value={cardNumber4}
                      onChangeText={(txt) => handleCardNumberChange(txt, 4)}
                      onKeyPress={(e) => handleCardKeyPress(e, 4)}
                      keyboardType="number-pad"
                      maxLength={4}
                    />
                  </View>
                  {!isCardValid && (
                    <Text style={{ color: C.red, fontSize: 11, marginTop: 4, fontFamily: 'Courier New' }}>
                      {t('err_invalid_card') || 'Invalid Card Number (Luhn Check Failed)'}
                    </Text>
                  )}
                  <Text style={{ color: C.dim, fontSize: 11, marginTop: 4, fontFamily: 'Courier New' }}>
                    {t('card_number_desc')}
                  </Text>
                </View>

                <View>
                  <Text style={[s.dim, { marginBottom: 6 }]}>
                    {t('card_brand_label')}
                  </Text>
                  <TextInput
                    style={[s.input, { marginBottom: 0 }]}
                    placeholder={t('card_brand_label')}
                    placeholderTextColor={C.dim}
                    value={cardBrand}
                    onChangeText={setCardBrand}
                    editable={true}
                  />
                </View>

                <View>
                  <Text style={[s.dim, { marginBottom: 6 }]}>
                    {t('cardholder_name_label')}
                  </Text>
                  <TextInput
                    style={[s.input, { marginBottom: 0 }]}
                    placeholder={t('cardholder_name_label')}
                    placeholderTextColor={C.dim}
                    value={cardholder}
                    onChangeText={setCardholder}
                  />
                  <Text style={{ color: C.dim, fontSize: 11, marginTop: 4, fontFamily: 'Courier New' }}>
                    {t('cardholder_name_desc')}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.dim, { marginBottom: 6 }]}>
                      {t('expiry_date_label')}
                    </Text>
                    <TextInput
                      style={[s.input, { marginBottom: 0 }]}
                      placeholder="MM/YY"
                      placeholderTextColor={C.dim}
                      value={expiry}
                      onChangeText={handleExpiryChange}
                      keyboardType="number-pad"
                      maxLength={5}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.dim, { marginBottom: 6 }]}>
                      {t('cvv_label')}
                    </Text>
                    <TextInput
                      style={[s.input, { marginBottom: 0 }]}
                      placeholder="CVV / CVC"
                      placeholderTextColor={C.dim}
                      value={cvv}
                      onChangeText={setCvv}
                      keyboardType="number-pad"
                      maxLength={4}
                    />
                  </View>
                </View>
              </View>
            ) : (
              <>
                <TextInput style={s.input} placeholder={t('username_label')} placeholderTextColor={C.dim} value={newUsername} onChangeText={setNewUsername} />
                <View style={[s.input, { flexDirection: 'row', alignItems: 'center' }]}>
                  <TextInput style={{ flex: 1, color: C.text }} placeholder={t('password_label')} value={newPassword} onChangeText={setNewPassword} secureTextEntry={!showNewPwd} />
                  <TouchableOpacity onPress={() => setShowNewPwd(!showNewPwd)}><Text style={{ color: C.yellow, fontSize: 12 }}>{showNewPwd ? t('label_hide') : t('label_show')}</Text></TouchableOpacity>
                </View>
                {/* --- 密碼產生器 --- */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                  <TouchableOpacity
                    onPress={generatePassword}
                    style={{ backgroundColor: C.panel, borderWidth: 1, borderColor: C.yellow, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}
                  >
                    <Text style={{ color: C.yellow, fontSize: 12, fontWeight: 'bold' }}>⚡ {t('gen_pwd_btn')}</Text>
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {(['upper', 'lower', 'number', 'special'] as const).map(opt => (
                      <TouchableOpacity
                        key={opt}
                        onPress={() => setGenConfig(p => ({ ...p, [opt]: !p[opt] }))}
                        style={[
                          { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
                          genConfig[opt] ? { backgroundColor: C.yellow, borderColor: C.yellow } : { borderColor: C.border }
                        ]}
                      >
                        <Text style={{ color: genConfig[opt] ? '#000' : C.dim, fontSize: 10, fontWeight: 'bold' }}>
                          {opt === 'upper' ? 'A' : opt === 'lower' ? 'a' : opt === 'number' ? '1' : '#'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ color: C.dim, fontSize: 10 }}>{genConfig.length}</Text>
                      <TouchableOpacity onPress={() => setGenConfig(p => ({ ...p, length: Math.max(8, p.length - 4) }))}>
                        <Text style={{ color: C.yellow, fontSize: 14, paddingHorizontal: 4 }}>−</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setGenConfig(p => ({ ...p, length: Math.min(32, p.length + 4) }))}>
                        <Text style={{ color: C.yellow, fontSize: 14, paddingHorizontal: 4 }}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
                <TextInput style={s.input} placeholder={t('totp_label')} placeholderTextColor={C.dim} value={newTotp} onChangeText={setNewTotp} />
                <TextInput style={s.input} placeholder={t('url_label')} placeholderTextColor={C.dim} value={newUrl} onChangeText={setNewUrl} keyboardType="url" autoCapitalize="none" />
              </>
            )}
            <TextInput 
              style={[s.input, { height: 80, textAlignVertical: 'top', paddingTop: 12 }]} 
              placeholder={t('notes_label')} 
              placeholderTextColor={C.dim} 
              value={newNotes} 
              onChangeText={setNewNotes} 
              multiline 
            />
            {cardType !== 'CARD' && (
              <View style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ color: C.dim, fontSize: 12 }}>{t('cat_label')}</Text>
                  <TouchableOpacity onPress={() => setViewMode('MANAGE_CATS')}>
                    <Text style={{ color: C.yellow, fontSize: 11, fontWeight: 'bold' }}>{t('manage_cats')} ❯</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {categories.map(c => (
                    <TouchableOpacity 
                      key={c.id} 
                      onPress={() => setItemCat(c.id)} 
                      style={[s.reqTag, itemCat === c.id && s.reqTagOn]}
                    >
                      <Text style={[s.reqTagTxt, itemCat === c.id && { color: C.yellow }]}>
                        {t(`cat_${c.id}`) === `cat_${c.id}` ? c.name : t(`cat_${c.id}`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: C.border }]} onPress={() => { clearForm(); setViewMode('LIST'); }}><Text style={[s.btnText, { color: C.white }]}>{t('label_cancel')}</Text></TouchableOpacity>
              <TouchableOpacity style={[s.btn, { flex: 1 }]} onPress={handleSave} disabled={isLoading}><Text style={s.btnText}>{isLoading ? '...' : (viewMode === 'ADD' ? t('save_btn') : t('edit_btn'))}</Text></TouchableOpacity>
            </View>
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {/* --- SETTINGS Mode --- */}
        {viewMode === 'SETTINGS' && (
          <ScrollView style={{ flex: 1, padding: 16 }}>
            {renderLicenseBanner()}
            
            {/* --- Watchtower Security Score --- */}
            <View style={[s.settingGroup, { backgroundColor: C.panel, padding: 20 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ color: C.dim, fontSize: 12 }}>{t('score_title')}</Text>
                  <Text style={{ color: stats.score > 80 ? C.green : C.yellow, fontSize: 36, fontWeight: 'bold' }}>{stats.score}%</Text>
                </View>
                <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ fontSize: 28 }}>🛡️</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 }}>
                {[
                  { label: t('sec_weak'), count: stats.weak, color: C.red, type: 'WEAK' as const },
                  { label: t('sec_reused'), count: stats.reused, color: C.yellow, type: 'REUSED' as const },
                  { label: t('sec_leaked'), count: stats.compromised, color: C.green, type: 'LEAKED' as const },
                ].map(card => (
                  <TouchableOpacity key={card.label} onPress={() => { setActiveFilter(card.type); setViewMode('LIST'); }} style={[s.secCard, activeFilter === card.type && { borderColor: card.color, borderWidth: 1 }]}>
                    <Text style={{ color: card.color, fontSize: 18, fontWeight: 'bold' }}>{card.count}</Text>
                    <Text style={{ color: C.dim, fontSize: 10, marginTop: 4 }}>{card.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* --- AI Advice --- */}
            <View style={[s.settingGroup, { borderLeftWidth: 4, borderLeftColor: C.blue, padding: 16 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 18, marginRight: 8 }}>🤖</Text>
                <Text style={{ color: C.blue, fontWeight: 'bold' }}>{t('ai_title')}</Text>
              </View>
              {aiAdvice.slice(0, 2).map((insight: any) => (
                <View key={insight.id} style={{ marginBottom: 12 }}>
                  <Text style={{ color: insight.level === 'CRITICAL' ? C.red : C.yellow, fontWeight: 'bold', fontSize: 13 }}>{t(insight.titleKey)}</Text>
                  <Text style={{ color: C.dim, fontSize: 11, marginTop: 4 }}>{t(insight.descriptionKey).split('{')[0]}</Text>
                </View>
              ))}
            </View>

            <View style={s.settingGroup}>
              <TouchableOpacity style={s.settingItem} onPress={() => setViewMode('CHANGE_KEY')}>
                <Text style={s.settingText}>{t('opt_change_key')}</Text>
                <Text style={s.settingStatus}>❯</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.settingItem} onPress={() => setViewMode('LANG_PICKER')}>
                <Text style={s.settingText}>{t('opt_lang')}</Text>
                <Text style={s.settingStatus}>{lang.toUpperCase()} ❯</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.settingItem} onPress={() => setViewMode('DATA_MANAGE')}>
                <Text style={s.settingText}>{t('cat_data')}</Text>
                <Text style={s.settingStatus}>❯</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.settingItem} onPress={() => setViewMode('DUPLICATES')}>
                <Text style={s.settingText}>🤖 {t('opt_duplicates') || 'AI 重複整理'}</Text>
                <Text style={[s.settingStatus, { color: C.yellow }]}>❯</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.settingItem} onPress={toggleBiometric}>
                <Text style={s.settingText}>{t('opt_bio')}</Text>
                <Text style={[s.settingStatus, { color: biometricAvailable ? C.green : C.dim }]}>{biometricAvailable ? 'ON' : 'OFF'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.settingItem, { opacity: activeLicense.isRealtimePACEnabled ? 1 : 0.6 }]} onPress={() => { if (!activeLicense.isRealtimePACEnabled) return; PrivacyAuditor.setMonitoring(true); setPacLogs(PrivacyAuditor.getAuditReport()); setViewMode('PAC_MONITOR'); }}>
                <Text style={s.settingText}>{t('opt_pac')}</Text>
                <Text style={[s.settingStatus, { color: C.green }]}>{t('pac_start')} ❯</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={s.settingItem} 
                activeOpacity={0.5}
                delayPressIn={0}
                onPress={() => {
                  requestAnimationFrame(() => {
                    Linking.openURL(`https://drbarretlin-code.github.io/cloud-password/privacy.html?lang=${lang}`);
                  });
                }}>
                <Text style={s.settingText}>{t('opt_privacy')}</Text>
                <Text style={s.settingStatus}>❯</Text>
              </TouchableOpacity>
            </View>

            {/* --- Version Display --- */}
            <View style={{ paddingVertical: 30, alignItems: 'center' }}>
              <Text style={{ color: C.dim, fontSize: 11, fontFamily: 'Courier New' }}>v1.0.0-PROD (SDK54)</Text>
              <Text style={{ color: 'rgba(255,255,255,0.05)', fontSize: 9, marginTop: 4 }}>[DR-BARRET-BUILD]</Text>
            </View>
          </ScrollView>
        )}

        {/* --- PAC_MONITOR Mode --- */}
        {viewMode === 'PAC_MONITOR' && (
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#333', flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: C.green, fontWeight: 'bold' }}>{t('pac_active')}</Text>
              <TouchableOpacity onPress={() => setViewMode('SETTINGS')}><Text style={{ color: C.yellow }}>{t('close_btn')}</Text></TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1, padding: 10 }}>
              {pacLogs.map((log, i) => <Text key={i} style={{ color: '#0F0', fontSize: 10, fontFamily: 'Courier' }}>{log}</Text>)}
            </ScrollView>
          </View>
        )}

        {/* --- MANUAL Mode --- */}
        {viewMode === 'MANUAL' && (() => {
          const manualSections = [
            { id: 'sec', t: t('manual_sec_t'), d: t('manual_sec_d'), icon: 'shield-checkmark', color: '#4CAF50' },
            { id: 'vault', t: t('manual_vault_t'), d: t('manual_vault_d'), icon: 'lock-closed', color: '#2196F3' },
            { id: 'sync', t: t('manual_sync_t'), d: t('manual_sync_d'), icon: 'cloud-upload', color: '#03A9F4' },
            { id: 'rescue', t: t('manual_rescue_t'), d: t('manual_rescue_d'), icon: 'medical', color: '#F44336' },
            { id: 'pro', t: t('manual_pro_t'), d: t('manual_pro_d'), icon: 'diamond', color: '#FF9800' },
          ];
          return (
            <ScrollView style={{ flex: 1, padding: 20 }}>
              {manualSections.map(sec => (
                <View key={sec.id} style={{ 
                  marginBottom: 20, backgroundColor: C.panel, padding: 18, 
                  borderRadius: 16, borderWidth: 1, borderColor: C.border,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                    <Ionicons name={sec.icon as any} size={22} color={sec.color} style={{ marginRight: 10 }} />
                    <Text style={{ color: sec.color, fontSize: 17, fontWeight: 'bold' }}>{sec.t}</Text>
                  </View>
                  <Text style={{ color: C.text, fontSize: 14, lineHeight: 22, opacity: 0.85 }}>{sec.d}</Text>
                </View>
              ))}
              
              <TouchableOpacity 
                style={[s.btn, { marginTop: 10, marginBottom: 50, backgroundColor: C.yellow }]} 
                onPress={handleExportPDF}
              >
                <Text style={[s.btnText, { color: '#000' }]}>📥 {t('download_btn')} (PDF)</Text>
              </TouchableOpacity>
            </ScrollView>
          );
        })()}

        {/* --- DIAGNOSTIC Mode --- */}
        {viewMode === 'DIAGNOSTIC' && (
          <View style={{ padding: 20 }}>
            <View style={{ backgroundColor: C.panel, padding: 20, borderRadius: 15, borderWidth: 1, borderColor: C.border, marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
                <Text style={{ fontSize: 40 }}>🛡️</Text>
                <View style={{ marginLeft: 15 }}>
                  <Text style={{ color: C.text, fontSize: 16, fontWeight: 'bold' }}>{t('diag_status_ok')}</Text>
                  <Text style={{ color: C.dim, fontSize: 11 }}>Argon2id + AES-256-GCM</Text>
                </View>
              </View>
              <Text style={{ color: C.dim, fontSize: 13, lineHeight: 20 }}>{t('manual_trouble_d')}</Text>
            </View>
            <TouchableOpacity style={s.btn} onPress={handleEmergencyReset} disabled={isLoading}>
              <Text style={s.btnText}>{isLoading ? '...' : t('diag_run_repair')}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[s.btn, { backgroundColor: C.red, marginTop: 20 }]} 
              onPress={handleEmergencyReset}
              disabled={isLoading}
            >
              <Text style={s.btnText}>⚠️ {t('diag_run_reset') || '緊急重設保險箱'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* --- DOCS Mode --- */}
        {viewMode === 'DOCS' && (
          <ScrollView style={{ flex: 1, padding: 20 }}>
            <View style={{ backgroundColor: C.panel, padding: 20, borderRadius: 10, borderWidth: 1, borderColor: C.border }}>
              <Text style={{ color: C.text, fontSize: 14, lineHeight: 24 }}>
                {docType === 'PRIVACY' ? t('doc_privacy_content') : (docType === 'SECURITY' ? t('doc_security_content') : '')}
              </Text>
            </View>
          </ScrollView>
        )}

        {/* --- DATA_MANAGE Mode --- */}
        {viewMode === 'DATA_MANAGE' && (
          <ScrollView style={{ flex: 1, backgroundColor: C.bg, padding: 16 }}>
            <View style={s.settingGroup}>
              <Text style={s.groupLabel}>{t('label_interchange')}</Text>
              <TouchableOpacity style={s.settingItem} onPress={handleImportCSV}><Text style={s.settingText}>{t('opt_import')}</Text><Text style={s.settingStatus}>❯</Text></TouchableOpacity>
              <TouchableOpacity style={s.settingItem} onPress={handleExportCSV}><Text style={s.settingText}>{t('opt_export')}</Text><Text style={s.settingStatus}>❯</Text></TouchableOpacity>
              <TouchableOpacity style={s.settingItem} onPress={handleEmergencyReset}>
                <Text style={[s.settingText, { color: C.red }]}>⚠️ {t('diag_run_reset') || '緊急重設保險箱'}</Text>
                <Text style={s.settingStatus}>🔥</Text>
              </TouchableOpacity>
            </View>
            <View style={s.settingGroup}>
              <Text style={s.groupLabel}>{t('label_cloud_sync')}</Text>
              <TouchableOpacity style={s.settingItem} onPress={handleSync}><Text style={s.settingText}>{t('opt_sync')}</Text><Text style={[s.settingStatus, { color: C.blue }]}>{t('sync_btn')} ❯</Text></TouchableOpacity>
              <TouchableOpacity style={s.settingItem} onPress={handleCloudLogout}><Text style={[s.settingText, { color: C.red }]}>{t('opt_cloud_logout')}</Text><Text style={s.settingStatus}>❯</Text></TouchableOpacity>
            </View>
            <View style={[s.settingGroup, { marginTop: 20 }]}>
              <Text style={s.groupLabel}>{t('label_danger_zone')}</Text>
              <TouchableOpacity style={s.settingItem} onPress={handleWipeAll}>
                <Text style={[s.settingText, { color: C.red }]}>{t('opt_wipe_all')}</Text>
                <Text style={s.settingStatus}>🔥</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* --- LANG_PICKER Mode --- */}
        {viewMode === 'LANG_PICKER' && (
          <ScrollView style={{ flex: 1 }}>
            {languages.map((l: any) => (
              <TouchableOpacity key={l.code} style={s.settingItem} onPress={() => handleLangChange(l.code as any)}>
                <Text style={{ color: lang === l.code ? C.yellow : C.text }}>{l.flag} {l.label}</Text>
                {lang === l.code && <Text style={{ color: C.yellow }}>✓</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* --- CHANGE_KEY Mode --- */}
        {viewMode === 'CHANGE_KEY' && (
          <View style={s.body}>
            <TextInput style={s.input} placeholder={t('new_key_placeholder')} value={newPassword} onChangeText={setNewPassword} secureTextEntry />
            <TextInput style={s.input} placeholder={t('confirm_key_placeholder')} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: C.border }]} onPress={() => setViewMode('SETTINGS')}><Text style={s.btnText}>{t('label_cancel')}</Text></TouchableOpacity>
              <TouchableOpacity style={[s.btn, { flex: 1 }]} onPress={handleChangeKey} disabled={isLoading}><Text style={s.btnText}>{isLoading ? '...' : t('btn_confirm_change')}</Text></TouchableOpacity>
            </View>
          </View>
        )}

        {/* --- DUPLICATES Mode --- */}
        {viewMode === 'DUPLICATES' && (() => {
          const duplicateGroups = AIGuard.findDuplicateGroups(items, similarityThreshold / 100);
          return (
            <View style={s.body}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ color: C.text, fontSize: 16, fontWeight: 'bold', fontFamily: 'Courier New' }}>🤖 {t('opt_duplicates') || 'AI 重複整理'}</Text>
                <Text style={{ color: C.dim, fontSize: 11 }}>{t('dup_groups') || '群組數'}: {duplicateGroups.length}</Text>
              </View>

              {/* Step Adjuster for Similarity */}
              <View style={{ padding: 12, marginBottom: 15, borderRadius: 8, backgroundColor: '#111', borderWidth: 1, borderColor: '#333' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: C.dim, fontSize: 11 }}>{t('dup_threshold') || '服務名稱相似度閾值'}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TouchableOpacity 
                      style={{ width: 26, height: 26, backgroundColor: '#222', borderRadius: 4, borderWidth: 1, borderColor: '#444', justifyContent: 'center', alignItems: 'center' }}
                      onPress={() => setSimilarityThreshold(prev => Math.max(10, prev - 5))}
                    >
                      <Text style={{ color: C.text, fontSize: 14, fontWeight: 'bold' }}>-</Text>
                    </TouchableOpacity>
                    <Text style={{ color: C.yellow, fontSize: 14, fontWeight: 'bold', minWidth: 40, textAlign: 'center' }}>{similarityThreshold}%</Text>
                    <TouchableOpacity 
                      style={{ width: 26, height: 26, backgroundColor: '#222', borderRadius: 4, borderWidth: 1, borderColor: '#444', justifyContent: 'center', alignItems: 'center' }}
                      onPress={() => setSimilarityThreshold(prev => Math.min(100, prev + 5))}
                    >
                      <Text style={{ color: C.text, fontSize: 14, fontWeight: 'bold' }}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={{ color: C.dim, fontSize: 9, marginTop: 8, lineHeight: 12 }}>
                  {t('dup_desc') || '調整相似度閾值，系統將自動比對解密後的憑證資料，列出相似度達標的帳號重複項。'}
                </Text>
              </View>

              <ScrollView style={{ flex: 1, marginBottom: 12 }}>
                {duplicateGroups.length === 0 ? (
                  <View style={{ alignItems: 'center', marginTop: 40, opacity: 0.5 }}>
                    <Text style={{ color: C.text, fontSize: 12 }}>{t('dup_congrats') || '🎉 恭喜！目前未偵測到任何重複的項目。'}</Text>
                  </View>
                ) : (
                  duplicateGroups.map((group, idx) => (
                    <View key={idx} style={{ backgroundColor: '#111', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#333', marginBottom: 12 }}>
                      <View style={{ borderBottomWidth: 1, borderBottomColor: '#222', paddingBottom: 6, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ color: C.yellow, fontSize: 12, fontWeight: 'bold' }}>📂 {group.keyService}</Text>
                        <Text style={{ color: C.dim, fontSize: 10 }}>{t('username_label') || '帳號'}: {group.items[0]?.username || '—'}</Text>
                      </View>

                      {group.items.map(item => (
                        <View key={item.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#222', borderStyle: 'dashed' }}>
                          <View style={{ flex: 1, marginRight: 10 }}>
                            <Text style={{ color: C.text, fontSize: 11 }}>{item.serviceName}</Text>
                            <Text style={{ color: C.dim, fontSize: 9, marginTop: 2 }}>
                              {t('password_label') || '密碼'}: {revealedItems[item.id] ? item.secretPayload.password : '••••••••'} ({(new Date(item.updatedAt)).toLocaleDateString()})
                            </Text>
                          </View>

                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            <TouchableOpacity 
                              style={{ paddingVertical: 3, paddingHorizontal: 6, backgroundColor: '#222', borderRadius: 4, borderWidth: 1, borderColor: '#444' }} 
                              onPress={() => setRevealedItems(p => ({ ...p, [item.id]: !p[item.id] }))}
                            >
                              <Text style={{ color: C.text, fontSize: 8 }}>{revealedItems[item.id] ? (t('label_hide') || '隱藏') : (t('label_show') || '顯示')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                              style={{ paddingVertical: 3, paddingHorizontal: 6, backgroundColor: 'rgba(255,0,0,0.1)', borderRadius: 4, borderWidth: 1, borderColor: C.red }} 
                              onPress={() => {
                                Alert.alert(
                                  t('dup_confirm_t') || '刪除重複憑證',
                                  `${t('dup_confirm_d') || '確定要刪除這筆重複憑證嗎？此動作無法復原。'} (${item.serviceName})`,
                                  [
                                    { text: t('label_cancel') || '取消', style: 'cancel' },
                                    { 
                                      text: t('label_delete') || '確定刪除', 
                                      style: 'destructive',
                                      onPress: async () => {
                                        await vaultManagerRef.current!.deleteEntry(item.id);
                                        loadItems();
                                      }
                                    }
                                  ]
                                );
                              }}
                            >
                              <Text style={{ color: C.red, fontSize: 8 }}>{t('label_delete') || '刪除'}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  ))
                )}
              </ScrollView>

              <TouchableOpacity style={[s.btn, { backgroundColor: C.border }]} onPress={() => setViewMode('SETTINGS')}>
                <Text style={s.btnText}>{t('back_btn')}</Text>
              </TouchableOpacity>
            </View>
          );
        })()}

        {/* --- MANAGE CATEGORIES Mode --- */}
        {viewMode === 'MANAGE_CATS' && (
          <View style={s.body}>
            {editingCatId === 'NEW' ? (
              <View style={[s.genPanel, { marginBottom: 20, borderRadius: 12 }]}>
                <TextInput 
                  style={s.input} 
                  placeholder={t('cat_name_placeholder')} 
                  value={newCatName} 
                  onChangeText={setNewCatName} 
                  autoFocus 
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: C.border }]} onPress={() => { setEditingCatId(null); setNewCatName(''); }}>
                    <Text style={[s.btnText, { color: C.white }]}>{t('label_cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.btn, { flex: 1 }]} onPress={() => {
                    if (newCatName) {
                      const newCat = { id: `cat_${Date.now()}`, name: newCatName };
                      saveCategories([...categories, newCat]);
                      setEditingCatId(null);
                      setNewCatName('');
                    }
                  }}>
                    <Text style={s.btnText}>{t('save_btn')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity 
                style={[s.btn, { marginBottom: 20, borderRadius: 12 }]} 
                onPress={() => { setEditingCatId('NEW'); setNewCatName(''); }}
              >
                <Text style={s.btnText}>+ {t('add_cat')}</Text>
              </TouchableOpacity>
            )}

            <FlatList
              data={categories}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <View style={[s.settingItem, { paddingVertical: 12 }]}>
                  <Text style={s.settingText}>
                    {t(`cat_${item.id}`) === `cat_${item.id}` ? item.name : t(`cat_${item.id}`)}
                  </Text>
                  {editingCatId === item.id ? (
                    <View style={{ marginTop: 10, width: '100%' }}>
                      <TextInput 
                        style={[s.input, { marginBottom: 10 }]} 
                        value={newCatName} 
                        onChangeText={setNewCatName} 
                        autoFocus 
                      />
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity style={[s.smallBtn, { flex: 1, backgroundColor: C.border }]} onPress={() => setEditingCatId(null)}>
                          <Text style={{ color: C.white, fontSize: 10 }}>{t('label_cancel')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.smallBtn, { flex: 1 }]} onPress={() => {
                          if (newCatName) {
                            const updated = categories.map(c => c.id === item.id ? { ...c, name: newCatName } : c);
                            saveCategories(updated);
                            setEditingCatId(null);
                          }
                        }}>
                          <Text style={{ color: C.invText, fontSize: 10 }}>{t('save_btn')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: 15, alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', gap: 10, marginRight: 10 }}>
                        <TouchableOpacity 
                          onPress={() => {
                            const idx = categories.findIndex(c => c.id === item.id);
                            handleMoveCategory(idx, 'UP');
                          }}
                          disabled={categories.findIndex(c => c.id === item.id) === 0}
                          style={{ opacity: categories.findIndex(c => c.id === item.id) === 0 ? 0.3 : 1 }}
                        >
                          <Text style={{ color: C.yellow, fontSize: 18 }}>▲</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          onPress={() => {
                            const idx = categories.findIndex(c => c.id === item.id);
                            handleMoveCategory(idx, 'DOWN');
                          }}
                          disabled={categories.findIndex(c => c.id === item.id) === categories.length - 1}
                          style={{ opacity: categories.findIndex(c => c.id === item.id) === categories.length - 1 ? 0.3 : 1 }}
                        >
                          <Text style={{ color: C.yellow, fontSize: 18 }}>▼</Text>
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity onPress={() => {
                        setEditingCatId(item.id);
                        setNewCatName(item.name);
                      }}>
                        <Text style={{ color: C.yellow, fontSize: 12 }}>{t('edit_btn')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteCategory(item.id)}>
                        <Text style={{ color: C.red, fontSize: 12 }}>{t('delete_btn')}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            />
          </View>
        )}
        {renderLicenseBlock()}
      </SafeAreaView>
    );
  } catch (e: any) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', padding: 30 }}>
        <Text style={{ color: '#F44336', fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>SYSTEM RECOVERY</Text>
        <Text style={{ color: '#FFF', textAlign: 'center', marginBottom: 30 }}>A rendering error occurred after login. The system has automatically entered recovery mode.</Text>
        <View style={{ backgroundColor: '#1A1A1A', padding: 15, borderRadius: 10, width: '100%' }}>
          <Text style={{ color: '#AAA', fontSize: 12, fontFamily: 'Courier' }}>ERROR: {e.message}</Text>
        </View>
        <TouchableOpacity 
          style={{ marginTop: 40, padding: 15, backgroundColor: '#FFD700', borderRadius: 10 }}
          onPress={() => setAppState('LOCKED')}
        >
          <Text style={{ color: '#000', fontWeight: 'bold' }}>RETURN TO LOGIN</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

export default VaultScreen;
