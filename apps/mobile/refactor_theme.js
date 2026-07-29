const fs = require('fs');

let content = fs.readFileSync('src/screens/VaultScreen.tsx', 'utf-8');

// 1. Remove old `const C`
content = content.replace(/const C = \{[\s\S]*?\};\n/, '');

// 2. Remove old `const s = StyleSheet.create`
content = content.replace(/const s = StyleSheet\.create\(\{[\s\S]*?\}\);\n/, '');

// 3. Inject useAppTheme and C, s near the top
const hookInjection = `
const useAppTheme = (theme: 'dark' | 'light') => {
  return React.useMemo(() => {
    const C = theme === 'dark' ? {
      bg: '#1A1A1A', card: '#2D2D2D', yellow: '#FFC107',
      dim: '#888888', white: '#FFFFFF', red: '#F44336',
      green: '#4CAF50', blue: '#2196F3', border: '#444444',
      text: '#FFF', panel: '#252525', inputBg: '#2D2D2D', inputBorder: '#555',
      invText: '#000', icon: '#888'
    } : {
      bg: '#F5F5F5', card: '#FFFFFF', yellow: '#D99000',
      dim: '#666666', white: '#111111', red: '#D32F2F',
      green: '#2E7D32', blue: '#1976D2', border: '#DDDDDD',
      text: '#111', panel: '#F0F0F0', inputBg: '#FFFFFF', inputBorder: '#CCC',
      invText: '#FFF', icon: '#333'
    };

    const s = StyleSheet.create({
      container: { flex: 1, backgroundColor: C.bg, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
      header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.card, borderBottomWidth: 2, borderBottomColor: C.yellow },
      headerTitle: { fontSize: 18, fontWeight: 'bold', color: C.yellow, fontFamily: 'Courier New', letterSpacing: 2 },
      section: { color: C.yellow, fontSize: 14, fontWeight: '700', letterSpacing: 1, marginBottom: 12 },
      settingGroup: { backgroundColor: C.panel, borderRadius: 12, marginBottom: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
      groupLabel: { color: C.dim, fontSize: 10, padding: 12, paddingBottom: 4, letterSpacing: 1 },
      settingItem: { padding: 16, borderTopWidth: 1, borderTopColor: C.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
      settingText: { color: C.text, fontSize: 15 },
      dot: { width: 10, height: 10, borderRadius: 5 },
      body: { flex: 1, padding: 20 },
      dim: { fontSize: 12, color: C.dim, fontFamily: 'Courier New', marginBottom: 8 },
      input: { backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.inputBorder, color: C.text, padding: 12, fontFamily: 'Courier New', fontSize: 14, marginBottom: 16 },
      btn: { backgroundColor: C.yellow, padding: 14, alignItems: 'center', marginTop: 4 },
      btnText: { fontWeight: 'bold', fontFamily: 'Courier New', fontSize: 14, color: C.invText },
      smallBtn: { backgroundColor: C.yellow, paddingHorizontal: 8, paddingVertical: 4 },
      smallBtnText: { fontWeight: 'bold', fontFamily: 'Courier New', fontSize: 10, color: C.invText },
      statusText: { marginTop: 12, fontSize: 11, color: C.dim, fontFamily: 'Courier New' },
      card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, marginBottom: 10, flexDirection: 'row', overflow: 'hidden', padding: 10 },
      accent: { width: 4, backgroundColor: C.yellow, marginRight: 0, marginLeft: -10, marginTop: -10, marginBottom: -10 },
      cardTitle: { fontSize: 14, fontWeight: 'bold', color: C.text, fontFamily: 'Courier New' },
      pwdRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.bg, padding: 6, marginTop: 6, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed' },
      pwdOff: { color: C.yellow, letterSpacing: 4, fontFamily: 'Courier New', fontSize: 12 },
      pwdOn: { color: C.text, fontFamily: 'Courier New', fontSize: 11, flex: 1 },
      link: { color: C.dim, fontFamily: 'Courier New', fontSize: 11, textDecorationLine: 'underline' },
      tag: { color: C.dim, fontFamily: 'Courier New', fontSize: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 5, paddingVertical: 2 },
      genPanel: { backgroundColor: theme === 'dark' ? '#111' : '#E8E8E8', borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 16 },
      reqTag: { borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 8, paddingVertical: 3 },
      reqTagOn: { borderColor: C.yellow, backgroundColor: 'rgba(255,193,7,0.1)' },
      reqTagTxt: { fontSize: 10, color: C.dim, fontFamily: 'Courier New', fontWeight: 'bold' },
      reqTagTxtOn: { color: C.yellow },
      tab: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.panel, marginRight: 8, borderWidth: 1, borderColor: C.border },
      tabActive: { borderColor: C.yellow, backgroundColor: 'rgba(255,193,7,0.1)' },
      tabText: { color: C.dim, fontSize: 12, fontWeight: 'bold', fontFamily: 'Courier New' },
      tabTextActive: { color: C.yellow },
    });
    return { C, s };
  }, [theme]);
};
`;

content = content.replace("export function VaultScreen() {", hookInjection + "\nexport function VaultScreen() {");

// 4. Update the state name and destructure useAppTheme
content = content.replace(/const \[loginTheme, setLoginTheme\] = useState<'dark' \| 'light'>\('dark'\);/, 
  "const [appTheme, setAppTheme] = useState<'dark' | 'light'>('dark');\n  const { C, s } = useAppTheme(appTheme);");

// 5. Replace references to loginTheme with appTheme
content = content.replace(/loginTheme/g, 'appTheme');

// 6. Fix specific inline styles that clash with themes
// Replace `#FFF` with `C.text` (unless it's already fixed in the hook)
content = content.replace(/'#FFF'/g, 'C.text');
content = content.replace(/'#FFFFFF'/g, 'C.text');
// Replace `#1E1E1E` and `#252525` and `#1A1A1A` and `#222` with `C.panel` or `C.bg`
content = content.replace(/'#1E1E1E'/g, 'C.panel');
content = content.replace(/'#2A2A2A'/g, 'C.panel');
content = content.replace(/'#252525'/g, 'C.panel');
content = content.replace(/'#1A1A1A'/g, 'C.bg');
content = content.replace(/'#222'/g, 'C.panel');
content = content.replace(/'#333'/g, 'C.border');
content = content.replace(/'#444'/g, 'C.border');
content = content.replace(/'#555'/g, 'C.inputBorder');
content = content.replace(/'#CCC'/g, 'C.dim');

// Fix specific login inputs background logic that was added for light mode
content = content.replace(/backgroundColor: '#FAFAFA'/g, 'backgroundColor: C.bg');
content = content.replace(/appTheme === 'light' \? '#FAFAFA' : C\.bg/g, 'C.bg');
content = content.replace(/appTheme === 'light' \? '#222' : C\.yellow/g, 'C.yellow');
content = content.replace(/appTheme === 'light' && \{ backgroundColor: C\.text, color: C\.panel, borderColor: '#DDD', borderWidth: 1 \}/g, ''); // Remove the conditional array since we now have dynamic C.inputBg
content = content.replace(/placeholderTextColor=\{appTheme === 'light' \? '#999' : C\.dim\}/g, 'placeholderTextColor={C.dim}');

// Fix the sun/moon button color
content = content.replace(/color=\{appTheme === 'dark' \? C\.yellow : C\.border\}/g, 'color={appTheme === "dark" ? C.yellow : C.text}');

// Add the appTheme toggle button to the main header so it's a global toggle!
const globalToggleBtn = `
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity onPress={() => setAppTheme(p => p === 'dark' ? 'light' : 'dark')}>
            <Feather name={appTheme === 'dark' ? "sun" : "moon"} size={20} color={C.yellow} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { vaultManager.lockVault(); setAppState('LOCKED'); }}>
            <Feather name="lock" size={20} color={C.yellow} />
          </TouchableOpacity>
        </View>
      </View>
`;
content = content.replace(/<TouchableOpacity onPress=\{\(\) => \{ vaultManager\.lockVault\(\); setAppState\('LOCKED'\); \}\}>\n\s*<Text style=\{s\.headerTitle\}>🔒<\/Text>\n\s*<\/TouchableOpacity>\n\s*<\/View>/g, globalToggleBtn);

fs.writeFileSync('src/screens/VaultScreen.tsx', content);
console.log('Theme refactor complete!');
