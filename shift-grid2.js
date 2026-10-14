(function() {
  'use strict';

  const APP_ID = kintone.app.getId();
  const STAFF_LIST = ['正田', '濱垣', '鶴原', '鳥羽', '店長'];
  const MARKS = ['', '○', '△', '×', '午前×', '午後×'];
  const DAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];
  const VIEW_NAMES = ['シフト入力', 'シフト一覧', 'シフト表'];

  // 直近12ヶ月のリストを生成
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

  // 対象月のレコードを1件取得（1ヶ月＝1レコード）
  function fetchMonthRecord(targetMonth, callback) {
    kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
      app: APP_ID,
      query: 'target_month = "' + targetMonth + '" limit 1',
      fields: ['$id', 'target_month', 'shift_data', '備考']
    }).then(function(resp) {
      callback(null, resp.records.length > 0 ? resp.records[0] : null);
    }).catch(function(err) {
      callback(err, null);
    });
  }

  // 保存（1ヶ月＝1レコードをupsert）
  function saveMonthRecord(existing, targetMonth, gridData, bikouData, callback) {
    const record = {
      staff_name: { value: STAFF_LIST[STAFF_LIST.length - 1] },
      target_month: { value: targetMonth },
      shift_data: { value: JSON.stringify(gridData) },
      備考: { value: JSON.stringify(bikouData) }
    };
    if (existing) {
      kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', {
        app: APP_ID, id: existing.$id.value, record: record
      }).then(function() { callback(null); }).catch(callback);
    } else {
      kintone.api(kintone.api.url('/k/v1/record', true), 'POST', {
        app: APP_ID, record: record
      }).then(function() { callback(null); }).catch(callback);
    }
  }

  function renderGrid(isMobile) {
    const el = isMobile
      ? kintone.mobile.app.getHeaderSpaceElement()
      : kintone.app.getHeaderSpaceElement();
    if (!el) return;
    el.innerHTML = '';

    // 印刷用スタイル
    const style = document.createElement('style');
    style.textContent =
      '@media print {' +
      '  .shift-no-print { display:none !important; }' +
      '  .shift-grid-table select { -webkit-appearance:none; appearance:none; border:none !important; background:transparent !important; text-align:center; }' +
      '  .shift-grid-table textarea { border:none !important; }' +
      '}' +
      '.shift-grid-table select { -webkit-appearance:none; appearance:none; }';
    el.appendChild(style);

    const monthOptions = getMonthOptions();
    let currentMonth = monthOptions[1];
    let existingRecord = null;

    const container = document.createElement('div');
    container.style.cssText = 'padding:16px;font-family:sans-serif;';

    // ヘッダー（操作部・印刷時は非表示）
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

    const saveBtn = document.createElement('button');
    saveBtn.textContent = '保存';
    saveBtn.style.cssText = 'background:#4a7c59;color:white;border:none;padding:7px 20px;border-radius:4px;cursor:pointer;font-size:14px;';

    const printBtn = document.createElement('button');
    printBtn.textContent = '印刷';
    printBtn.style.cssText = 'background:#666;color:white;border:none;padding:7px 16px;border-radius:4px;cursor:pointer;font-size:14px;';

    header.appendChild(document.createTextNode('対象月：'));
    header.appendChild(monthSel);
    header.appendChild(loadBtn);
    header.appendChild(saveBtn);
    header.appendChild(printBtn);
    container.appendChild(header);

    // 印刷用タイトル（画面では控えめ、印刷時に出る）
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
      // ヘッダー行
      html += '<tr>';
      html += '<th style="border:1px solid #ccc;padding:4px 6px;background:#f5f5f5;text-align:center;white-space:nowrap;">日付</th>';
      STAFF_LIST.forEach(function(name) {
        html += '<th style="border:1px solid #ccc;padding:4px 6px;background:#e8f0eb;text-align:center;min-width:48px;white-space:nowrap;">' + name + '</th>';
      });
      html += '<th style="border:1px solid #ccc;padding:4px 6px;background:#f5f5f5;text-align:center;min-width:120px;">備考</th>';
      html += '</tr>';

      // 日付ごとの行
      for (let d = 1; d <= days; d++) {
        const dow = getDow(currentMonth, d);
        const dowColor = dowHeaderColor(dow);
        html += '<tr>';
        // 日付＋曜日
        html += '<td style="border:1px solid #ccc;padding:4px 6px;text-align:center;background:' + dowColor + ';white-space:nowrap;">' + d + '日(' + DAYS_JA[dow] + ')</td>';
        // 各スタッフのセル
        STAFF_LIST.forEach(function(name) {
          const v = (grid[name] && grid[name][d]) ? grid[name][d] : '';
          const bg = markColor(v);
          html += '<td style="border:1px solid #ccc;padding:2px;background:' + bg + ';">';
          html += '<select data-staff="' + name + '" data-day="' + d + '" style="width:100%;border:none;background:transparent;font-size:12px;text-align:center;padding:2px;">';
          MARKS.forEach(function(m) {
            html += '<option value="' + m + '"' + (m === v ? ' selected' : '') + '>' + m + '</option>';
          });
          html += '</select></td>';
        });
        // 備考セル
        const note = bikou[d] || '';
        html += '<td style="border:1px solid #ccc;padding:2px;">';
        html += '<input type="text" data-bikou-day="' + d + '" value="' + note.replace(/"/g, '&quot;') + '" style="width:100%;border:none;background:transparent;font-size:12px;padding:2px;box-sizing:border-box;">';
        html += '</td>';
        html += '</tr>';
      }
      html += '</table>';
      tableArea.innerHTML = html;

      // セレクト変更で背景色を更新
      tableArea.querySelectorAll('select[data-staff]').forEach(function(sel) {
        sel.addEventListener('change', function() {
          this.parentElement.style.background = markColor(this.value);
        });
      });
    }

    function loadData() {
      currentMonth = monthSel.value;
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

    saveBtn.addEventListener('click', function() {
      const grid = {};
      tableArea.querySelectorAll('select[data-staff]').forEach(function(sel) {
        const name = sel.dataset.staff;
        const day = sel.dataset.day;
        if (!grid[name]) grid[name] = {};
        grid[name][day] = sel.value;
      });
      const bikou = {};
      tableArea.querySelectorAll('input[data-bikou-day]').forEach(function(inp) {
        if (inp.value.trim() !== '') bikou[inp.dataset.bikouDay] = inp.value;
      });
      msg.textContent = '保存中...';
      saveMonthRecord(existingRecord, currentMonth, grid, bikou, function(err) {
        if (err) { msg.textContent = 'エラーが発生しました。'; return; }
        msg.textContent = '保存しました。';
        loadData();
      });
    });

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
