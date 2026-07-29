let currentFields: { user?: HTMLInputElement, pass: HTMLInputElement }[] = [];

function findFields() {
  const passwords = document.querySelectorAll('input[type="password"]');
  passwords.forEach((pass: any) => {
    if (pass.dataset.pvInjected) return;
    
    // Find associated username field (simple heuristic)
    const form = pass.form;
    let user = null;
    if (form) {
      user = form.querySelector('input[type="text"], input[type="email"]');
    }

    injectIcon(pass, user);
    pass.dataset.pvInjected = "true";
  });
}

function injectIcon(pass: HTMLInputElement, user: HTMLInputElement | null) {
  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.style.display = 'inline-block';
  wrapper.style.width = '100%';
  
  pass.parentNode?.insertBefore(wrapper, pass);
  wrapper.appendChild(pass);

  const icon = document.createElement('div');
  icon.innerHTML = '🛡️';
  icon.style.position = 'absolute';
  icon.style.right = '10px';
  icon.style.top = '50%';
  icon.style.transform = 'translateY(-50%)';
  icon.style.cursor = 'pointer';
  icon.style.zIndex = '10000';
  icon.title = "Auto-fill with Cloud Password";

  icon.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'PV_REQUEST_FILL', hostname: window.location.hostname }, (response) => {
      if (response && response.items && response.items.length > 0) {
        showDropdown(icon, response.items, (item: any) => {
          if (user) user.value = item.username;
          pass.value = item.password;
          // Trigger events
          [user, pass].forEach(el => {
            if (el) {
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          });
        });
      } else {
        alert("No matching accounts found in Cloud Password. Please unlock your vault or add this site.");
      }
    });
  };

  wrapper.appendChild(icon);
}

function showDropdown(anchor: HTMLElement, items: any[], onSelect: (item: any) => void) {
  const existing = document.getElementById('pv-fill-dropdown');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.id = 'pv-fill-dropdown';
  menu.style.position = 'absolute';
  menu.style.background = '#222';
  menu.style.color = '#fff';
  menu.style.border = '1px solid #ffd700';
  menu.style.borderRadius = '8px';
  menu.style.padding = '8px';
  menu.style.zIndex = '10001';
  menu.style.top = '100%';
  menu.style.right = '0';
  menu.style.minWidth = '150px';
  menu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';

  items.forEach(item => {
    const row = document.createElement('div');
    row.style.padding = '8px';
    row.style.cursor = 'pointer';
    row.style.borderBottom = '1px solid #333';
    row.innerHTML = `<div style="font-weight:bold;font-size:12px">${item.serviceName}</div><div style="font-size:10px;color:#aaa">${item.username}</div>`;
    row.onmouseover = () => row.style.background = '#333';
    row.onmouseout = () => row.style.background = 'transparent';
    row.onclick = () => {
      onSelect(item);
      menu.remove();
    };
    menu.appendChild(row);
  });

  anchor.parentNode?.appendChild(menu);

  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target as Node)) menu.remove();
  }, { once: true });
}

// Watch for changes
const observer = new MutationObserver(findFields);
observer.observe(document.body, { childList: true, subtree: true });
findFields();
