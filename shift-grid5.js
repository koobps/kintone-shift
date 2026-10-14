(function() {
  'use strict';

  function getAppId() {
    return kintone.app.getId() || kintone.mobile.app.getId();
  }
  const STAFF_LIST = ['生田', '濱垣', '鶴原', '鳥羽', '店長'];
  const MARKS = ['', '○', '△', '×', '午前×', '午後×'];
  const DAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];
  const VIEW_NAMES = ['シフト入力', 'シフト一覧', 'シフト表'];

  function getMonthOptions() {
    const options = [];
    const now = new Date();
    for (let i = -1; i < 11; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      options.push(d.getFullYear() + '年' + (d.getMonth() + 1) + '月');
    }
    return options;
  }

  function getDaysInMonth(yearMonth) {
    const match = yearMonth.match(/(\d+)年(\d+)月/);
    if (!match) return 31;
    return new Date(parseInt(match[1]), parseInt(match[2]), 0).getDate();
  }

  function getDow(yearMonth, day) {
    const match = yearMonth.match(/(\d+)年(\d+)月/);
    if (!match) return 0;
    return new Date(parseInt(match[1]), parseInt(match[2]) - 1, day).getDay();
  }

  function parseJSON(raw) {
    try { return JSON.parse(raw); } catch(e) { return {}; }
  }

  function markColor(v) {
    if (v === '○') return '#e8f5e9';
    if (v === '△') return '#fff9c4';
    if (v === '×') return '#ffebee';
    if (v === '午前×') return '#fce4ec';
    if (v === '午後×') return '#f3e5f5';
    return '';
  }

  function dowHeaderColor(dow) {
    if (dow === 0) return '#ffebee';
    if (dow === 6) return '#e3f2fd';
    return '#f5f5f5';
  }

  function fetchMonthRecord(targetMonth, callback) {
    kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
      app: getAppId(),
      query: 'target_month = "' + targetMonth + '" limit 1',
      fields: ['$id', 'target_month', 'shift_data', '備考']
    }).then(function(resp) {
      callback(null, resp.records.length > 0 ? resp.records[0] : null);
    }).catch(function(err) {
      callback(err, null);
    });
  }

  function saveMonthRecord(existing, targetMonth, gridData, bikouData, callback) {
    const record = {
      staff_name: { value: STAFF_LIST[STAFF_LIST.length - 1] },
      target_month: { value: targetMonth },
      shift_data: { value: JSON.stringify(gridData) },
      備考: { value: JSON.stringify(bikouData) }
    };
    if (existing) {
      kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', {
        app: getAppId(), id: existing.$id.value, record: record
      }).then(function() { callback(null); }).catch(callback);
    } else {
      kintone.api(kintone.api.url('/k/v1/record', true), 'POST', {
        app: getAppId(), record: record
      }).then(function() { callback(null); }).catch(callback);
    }
  }

  function renderGrid(isMobile) {
    const el = isMobile
      ? kintone.mobile.app.getHeaderSpaceElement()
      : kintone.app.getHeaderSpaceElement();
    if (!el) return;
    el.innerHTML = '';

    const style = document.createElement('style');
    style.textContent =
      '@media print {' +
      '  body * { visibility:hidden !important; }' +
      '  #shift-print-area, #shift-print-area * { visibility:visible !important; }' +
      '  #shift-print-area { position:absolute !important; left:0; top:0; width:100%; padding:0 !important; }' +
      '  .shift-no-print { display:none !important; }' +
      '  .shift-grid-table select { -webkit-appearance:none; appearance:none; border:none !important; background:transparent !important; text-align:center; }' +
      '  .shift-grid-table input { border:none !important; }' +
      '}' +
      '.shift-grid-table select { -webkit-appearance:none; appearance:none; }' +
      '.shift-grid-table select:disabled { color:#333; opacity:1; }' +
      '.shift-btn { border:none;border-radius:4px;cursor:pointer;font-size:12px;padding:4px 8px;white-space:nowrap; }' +
      '.shift-edit-btn { background:#fff;color:#4a7c59;border:1px solid #4a7c59; }' +
      '.shift-edit-btn:disabled { color:#aaa;border-color:#ddd;cursor:default; }' +
      '.shift-save-btn { background:#4a7c59;color:#fff; }' +
      '.shift-save-btn:disabled { background:#ccc;cursor:default; }';
    el.appendChild(style);

    const monthOptions = getMonthOptions();
    let currentMonth = monthOptions[1];
    let existingRecord = null;
    let editingStaff = null;

    const container = document.createElement('div');
    container.id = 'shift-print-area';
    container.style.cssText = 'padding:16px;font-family:sans-serif;';

    // 操作部（印刷時は非表示）
    const header = document.createElement('div');
    header.className = 'shift-no-print';
    header.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:16px;';

    const monthSel = document.createElement('select');
    monthSel.style.cssText = 'border:1px solid #ccc;padding:6px 10px;border-radius:4px;font-size:14px;';
    monthOptions.forEach(function(m) {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = m;
      if (m === currentMonth) opt.selected = true;
      monthSel.appendChild(opt);
    });

    const loadBtn = document.createElement('button');
    loadBtn.textContent = '読み込む';
    loadBtn.style.cssText = 'background:#fff;color:#4a7c59;border:1px solid #4a7c59;padding:7px 16px;border-radius:4px;cursor:pointer;font-size:14px;';

    const printBtn = document.createElement('button');
    printBtn.textContent = '印刷';
    printBtn.style.cssText = 'background:#666;color:white;border:none;padding:7px 16px;border-radius:4px;cursor:pointer;font-size:14px;';

    header.appendChild(document.createTextNode('対象月：'));
    header.appendChild(monthSel);
    header.appendChild(loadBtn);
    header.appendChild(printBtn);
    container.appendChild(header);

    const title = document.createElement('div');
    title.style.cssText = 'font-size:15px;font-weight:bold;margin-bottom:8px;';
    container.appendChild(title);

    const tableArea = document.createElement('div');
    tableArea.style.cssText = 'overflow-x:auto;';
    container.appendChild(tableArea);

    const msg = document.createElement('div');
    msg.className = 'shift-no-print';
    msg.style.cssText = 'margin-top:8px;font-size:13px;color:#666;';
    container.appendChild(msg);

    el.appendChild(container);

    function renderTable(grid, bikou) {
      const days = getDaysInMonth(currentMonth);
      title.textContent = currentMonth + '　シフト希望表（GreenGrass）';

      let html = '<table class="shift-grid-table" style="border-collapse:collapse;font-size:12px;">';

      // ヘッダー行：スタッフ名＋編集ボタン
      html += '<tr>';
      html += '<th style="border:1px solid #ccc;padding:4px 6px;background:#f5f5f5;text-align:center;white-space:nowrap;">日付</th>';
      STAFF_LIST.forEach(function(name) {
        html += '<th style="border:1px solid #ccc;padding:4px 6px;background:#e8f0eb;text-align:center;min-width:52px;white-space:nowrap;">';
        html += '<div>' + name + '</div>';
        html += '<div class="shift-no-print" style="margin-top:3px;"><button class="shift-btn shift-edit-btn" data-edit="' + name + '">編集</button></div>';
        html += '</th>';
      });
      html += '<th style="border:1px solid #ccc;padding:4px 6px;background:#f5f5f5;text-align:center;min-width:120px;">備考</th>';
      html += '</tr>';

      // 日付行
      for (let d = 1; d <= days; d++) {
        const dow = getDow(currentMonth, d);
        const dowColor = dowHeaderColor(dow);
        html += '<tr>';
        html += '<td style="border:1px solid #ccc;padding:4px 6px;text-align:center;background:' + dowColor + ';white-space:nowrap;">' + d + '日(' + DAYS_JA[dow] + ')</td>';
        STAFF_LIST.forEach(function(name) {
          const v = (grid[name] && grid[name][d]) ? grid[name][d] : '';
          const bg = markColor(v);
          html += '<td style="border:1px solid #ccc;padding:2px;background:' + bg + ';">';
          html += '<select class="shift-sel" data-staff="' + name + '" data-day="' + d + '" disabled style="width:100%;border:none;background:transparent;font-size:12px;text-align:center;padding:2px;">';
          MARKS.forEach(function(m) {
            html += '<option value="' + m + '"' + (m === v ? ' selected' : '') + '>' + m + '</option>';
          });
          html += '</select></td>';
        });
        const note = bikou[d] || '';
        html += '<td style="border:1px solid #ccc;padding:2px;">';
        html += '<input type="text" class="bikou-inp" data-bikou-day="' + d + '" value="' + note.replace(/"/g, '&quot;') + '" style="width:100%;border:none;background:transparent;font-size:12px;padding:2px;box-sizing:border-box;">';
        html += '</td>';
        html += '</tr>';
      }

      // フッター行：保存ボタン
      html += '<tr class="shift-no-print">';
      html += '<td style="border:1px solid #ccc;padding:4px 6px;background:#fafafa;"></td>';
      STAFF_LIST.forEach(function(name) {
        html += '<td style="border:1px solid #ccc;padding:4px 6px;background:#fafafa;text-align:center;">';
        html += '<button class="shift-btn shift-save-btn" data-save="' + name + '" disabled>保存</button>';
        html += '</td>';
      });
      html += '<td style="border:1px solid #ccc;padding:4px 6px;background:#fafafa;text-align:center;">';
      html += '<button class="shift-btn shift-save-btn" data-save-bikou="1">備考保存</button>';
      html += '</td>';
      html += '</tr>';

      html += '</table>';
      tableArea.innerHTML = html;

      // セレクト変更で背景色更新
      tableArea.querySelectorAll('select[data-staff]').forEach(function(sel) {
        sel.addEventListener('change', function() {
          this.parentElement.style.background = markColor(this.value);
        });
      });

      // 編集ボタン
      tableArea.querySelectorAll('button[data-edit]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          enableColumn(btn.dataset.edit);
        });
      });

      // 保存ボタン（スタッフ列）
      tableArea.querySelectorAll('button[data-save]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          saveColumn(btn.dataset.save);
        });
      });

      // 備考保存ボタン
      const bikouBtn = tableArea.querySelector('button[data-save-bikou]');
      if (bikouBtn) {
        bikouBtn.addEventListener('click', saveBikou);
      }
    }

    // 指定スタッフの列を編集可能にする
    function enableColumn(staff) {
      editingStaff = staff;
      // 全編集ボタンを無効化
      tableArea.querySelectorAll('button[data-edit]').forEach(function(btn) {
        btn.disabled = true;
        btn.textContent = (btn.dataset.edit === staff) ? '編集中' : '編集';
      });
      // 全セレクトを一旦ロック→対象列のみ解除
      tableArea.querySelectorAll('select[data-staff]').forEach(function(sel) {
        sel.disabled = (sel.dataset.staff !== staff);
      });
      // 対象列の保存ボタンのみ有効化
      tableArea.querySelectorAll('button[data-save]').forEach(function(btn) {
        btn.disabled = (btn.dataset.save !== staff);
      });
      // 対象列をハイライト
      tableArea.querySelectorAll('select[data-staff="' + staff + '"]').forEach(function(sel) {
        sel.parentElement.style.outline = '2px solid #4a7c59';
      });
      msg.textContent = staff + 'さんの列を編集中。入力後に保存を押してください。';
    }

    function saveColumn(staff) {
      msg.textContent = '保存中...';
      // 保存前に最新を取り直してマージ（他列の上書き防止）
      fetchMonthRecord(currentMonth, function(err, record) {
        if (err) { msg.textContent = 'エラーが発生しました。'; return; }
        const grid = record ? parseJSON(record.shift_data.value) : {};
        const bikou = record ? parseJSON(record.備考.value) : {};
        const col = {};
        tableArea.querySelectorAll('select[data-staff="' + staff + '"]').forEach(function(sel) {
          col[sel.dataset.day] = sel.value;
        });
        grid[staff] = col;
        saveMonthRecord(record, currentMonth, grid, bikou, function(err2) {
          if (err2) { msg.textContent = 'エラーが発生しました。'; return; }
          msg.textContent = staff + 'さんの希望を保存しました。';
          editingStaff = null;
          loadData();
        });
      });
    }

    function saveBikou() {
      msg.textContent = '保存中...';
      fetchMonthRecord(currentMonth, function(err, record) {
        if (err) { msg.textContent = 'エラーが発生しました。'; return; }
        const grid = record ? parseJSON(record.shift_data.value) : {};
        const bikou = {};
        tableArea.querySelectorAll('input[data-bikou-day]').forEach(function(inp) {
          if (inp.value.trim() !== '') bikou[inp.dataset.bikouDay] = inp.value;
        });
        saveMonthRecord(record, currentMonth, grid, bikou, function(err2) {
          if (err2) { msg.textContent = 'エラーが発生しました。'; return; }
          msg.textContent = '備考を保存しました。';
          loadData();
        });
      });
    }

    function loadData() {
      currentMonth = monthSel.value;
      editingStaff = null;
      msg.textContent = '読み込み中...';
      fetchMonthRecord(currentMonth, function(err, record) {
        if (err) { msg.textContent = 'エラーが発生しました。'; return; }
        existingRecord = record;
        const grid = record ? parseJSON(record.shift_data.value) : {};
        const bikou = record ? parseJSON(record.備考.value) : {};
        msg.textContent = '';
        renderTable(grid, bikou);
      });
    }

    printBtn.addEventListener('click', function() { window.print(); });
    loadBtn.addEventListener('click', loadData);
    loadData();
  }

  kintone.events.on('app.record.index.show', function(event) {
    if (VIEW_NAMES.indexOf(event.viewName) !== -1) {
      renderGrid(false);
    }
    return event;
  });

  kintone.events.on('mobile.app.record.index.show', function(event) {
    if (VIEW_NAMES.indexOf(event.viewName) !== -1) {
      renderGrid(true);
    }
    return event;
  });

})();
