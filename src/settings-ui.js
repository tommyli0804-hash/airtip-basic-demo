import * as settings from './settings.js';

/**
 * 设置面板：为每个映射参数生成对应控件
 *
 * number 型 → 滑块 + 数值输入
 * bool 型 → 复选框
 * 变更 → settings.set() → localStorage 持久化 → 各模块每帧读取
 */
export function createSettingsPanel(container) {
  const panel = document.createElement('div');
  panel.id = 'settings-panel';
  panel.innerHTML = `
    <div class="settings-header">
      <span class="settings-title">映射参数</span>
      <button class="settings-toggle" title="折叠">−</button>
    </div>
    <div class="settings-body"></div>
    <div class="settings-footer">
      <button class="settings-reset">恢复默认</button>
    </div>
  `;
  container.appendChild(panel);

  const body = panel.querySelector('.settings-body');
  const toggle = panel.querySelector('.settings-toggle');
  const resetBtn = panel.querySelector('.settings-reset');

  const inputs = {}; // key → { type, ...controls }

  for (const key of settings.KEYS) {
    const meta = settings.SETTING_META[key];
    if (!meta) continue;

    if (meta.type === 'bool') {
      inputs[key] = renderBool(body, key, meta);
    } else {
      inputs[key] = renderNumber(body, key, meta);
    }
  }

  // 折叠 / 展开
  let collapsed = false;
  toggle.addEventListener('click', () => {
    collapsed = !collapsed;
    body.style.display = collapsed ? 'none' : '';
    panel.querySelector('.settings-footer').style.display = collapsed ? 'none' : '';
    toggle.textContent = collapsed ? '+' : '−';
  });

  // 恢复默认值
  resetBtn.addEventListener('click', () => {
    settings.reset();
    for (const key of settings.KEYS) {
      const ctrl = inputs[key];
      if (!ctrl) continue;
      const v = settings.get(key);
      if (ctrl.type === 'bool') {
        ctrl.checkbox.checked = v;
      } else {
        ctrl.slider.value = v;
        ctrl.number.value = v;
      }
    }
  });

  return panel;
}

function renderNumber(body, key, meta) {
  const row = document.createElement('div');
  row.className = 'setting-row';

  const labelLine = document.createElement('div');
  labelLine.className = 'setting-label-line';
  labelLine.innerHTML = `
    <label>${meta.label}</label>
    <input type="number" class="setting-number" min="${meta.min}" max="${meta.max}" step="${meta.step}" />
    <span class="setting-unit">${meta.unit || ''}</span>
  `;

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'setting-slider';
  slider.min = meta.min;
  slider.max = meta.max;
  slider.step = meta.step;
  slider.value = settings.get(key);
  slider.title = meta.desc || '';

  const numberInput = labelLine.querySelector('.setting-number');
  numberInput.value = settings.get(key);
  numberInput.title = meta.desc || '';

  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    numberInput.value = v;
    settings.set(key, v);
  });

  numberInput.addEventListener('change', () => {
    let v = parseFloat(numberInput.value);
    if (Number.isNaN(v)) return;
    v = Math.max(meta.min, Math.min(meta.max, v));
    numberInput.value = v;
    slider.value = v;
    settings.set(key, v);
  });

  row.appendChild(labelLine);
  row.appendChild(slider);
  body.appendChild(row);

  return { type: 'number', slider, number: numberInput };
}

function renderBool(body, key, meta) {
  const row = document.createElement('div');
  row.className = 'setting-row setting-row-bool';

  const label = document.createElement('label');
  label.className = 'setting-bool-label';
  label.title = meta.desc || '';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'setting-checkbox';
  checkbox.checked = settings.get(key);

  const span = document.createElement('span');
  span.textContent = meta.label;

  label.appendChild(checkbox);
  label.appendChild(span);
  row.appendChild(label);
  body.appendChild(row);

  checkbox.addEventListener('change', () => {
    settings.set(key, checkbox.checked);
  });

  return { type: 'bool', checkbox };
}
