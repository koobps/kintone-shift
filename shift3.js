(function() {
  'use strict';

  const APP_ID = kintone.app.getId();
  const STAFF_LIST = ['正田', '濱垣', '鶴原', '鳥羽', '店長'];
  const MARKS = ['', '○', '△', '×', '午前×', '午後×'];
  const DAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

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

  // 対象年月から日数を取得
  function getDaysInMonth(yearMonth) {
    const match = yearMonth.match(/(\d+)年(\d+)月/);
    if (!match) return 31;
    return new Date(parseInt(match[1]), parseInt(match[2]), 0).getDate();
  }

  // 曜日インデックスを取得
  function getDow(yearMonth, day) {
    const match = yearMonth.match(/(\d+)年(\d+)月/);
    if (!match) return 0;
    return new Date(parseInt(match[1]), parseInt(match[2]) - 1, day).getDay();
  }

  // shift_dataのJSONをパース
  function parseShiftData(raw) {
    try { return JSON.parse(raw); } catch(e) { return {}; }
  }

  // 希望値に対応する背景色
  function markColor(v) {
    if (v === '○') return '#e8f5e9';
    if (v === '△') return '#fff9c4';
    if (v === '×') return '#ffebee';
    if (v === '午前×') return '#fce4ec';
    if (v === '午後×') return '#f3e5f5';
    return '';
  }

  // 曜日背景色
  function dowHeaderColor(dow) {
    if (dow === 0) return '#ffebee';
    if (dow === 6) return '#e3f2fd';
    return '#f5f5f5';
  }

  // APIでレコード取得
  function fetchRecords(targetMonth, callback) {
    kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
      app: APP_ID,
      query: 'target_month = "' + targetMonth + '" order by staff_name asc',
      fields: ['$id', 'staff_name', 'target_month', 'shift_data', '備考']
    }).then(function(resp) {
      callback(null, resp.records);
    }).catch(function(err) {
      callback(err, []);
    });
  }

  // レコード保存
  function saveRecord(myRecord, myStaff, targetMonth, data, bikou, callback) {
    const record = {
      staff_name: { value: myStaff },
      target_month: { value: targetMonth },
      shift_data: { value: JSON.stringify(data) },
      備考: { value: bikou }
    };
    if (myRecord) {
      kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', {
        app: APP_ID,
        id: myRecord.$id.value,
        record: record
      }).then(function() { callback(null); }).catch(callback);
    } else {
      kintone.api(kintone.api.url('/k/v1/record', true), 'POST', {
        app: APP_ID,
        record: record
      }).then(function() { callback(null); }).catch(callback);
    }
  }

  // ===== 入力ビュー（縦長） =====
  function renderInputView() {
    const el = kintone.app.getHeaderSpaceElement();
    el.innerHTML = '';

    const monthOptions = getMonthOptions();
    let currentMonth = monthOptions[1];
    let myStaff = STAFF_LIST[0];
    let allRecords = [];
    let myRecord = null;

    const container = document.createElement('div');
    container.style.cssText = 'padding:16px;font-family:sans-serif;max-width:480px;';

    // ヘッダー
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:16px;';

    // 対象月ドロップダウン
    const monthSel = document.createElement('select');
    monthSel.style.cssText = 'border:1px solid #ccc;padding:6px 10px;border-radius:4px;font-size:14px;';
    monthOptions.forEach(function(m) {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = m;
      if (m === currentMonth) opt.selected = true;
      monthSel.appendChild(opt);
    });

    // スタッフ選択
    const staffSel = document.createElement('select');
    staffSel.style.cssText = 'border:1px solid #ccc;padding:6px 10px;border-radius:4px;font-size:14px;';
    STAFF_LIST.forEach(function(name) {
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      staffSel.appendChild(opt);
    });

    // 読み込みボタン
    const loadBtn = document.createElement('button');
    loadBtn.textContent = '読み込む';
    loadBtn.style.cssText = 'background:#4a7c59;color:white;border:none;padding:7px 16px;border-radius:4px;cursor:pointer;font-size:14px;';

    header.appendChild(document.createTextNode('対象月：'));
    header.appendChild(monthSel);
    header.appendChild(document.createTextNode('　自分：'));
    header.appendChild(staffSel);
    header.appendChild(loadBtn);
    container.appendChild(header);

    // 入力テーブル領域
    const tableArea = document.createElement('div');
    container.appendChild(tableArea);

    // 保存ボタン
    const saveBtn = document.createElement('button');
    saveBtn.textContent = '希望を保存';
    saveBtn.style.cssText = 'background:#4a7c59;color:white;border:none;padding:8px 20px;border-radius:4px;cursor:pointer;font-size:14px;margin-top:12px;display:none;';
    container.appendChild(saveBtn);

    const msg = document.createElement('div');
    msg.style.cssText = 'margin-top:8px;font-size:13px;color:#666;';
    container.appendChild(msg);

    el.appendChild(container);

    function renderTable() {
      currentMonth = monthSel.value;
      myStaff = staffSel.value;
      const days = getDaysInMonth(currentMonth);
      const myData = myRecord ? parseShiftData(myRecord.shift_data.value) : {};
      const myBikou = myRecord ? (myRecord.備考.value || '') : '';

      // 他スタッフの希望サマリー
      let othersHtml = '';
      const others = allRecords.filter(function(r) {
        return r.staff_name.value !== myStaff && r.target_month.value === currentMonth;
      });
      if (others.length > 0) {
        othersHtml += '<div style="margin-bottom:12px;padding:8px;background:#f9f9f9;border-radius:4px;font-size:12px;color:#444;">';
        othersHtml += '<div style="font-weight:bold;margin-bottom:6px;color:#4a7c59;">他スタッフの希望</div>';
        others.forEach(function(rec) {
          const data = parseShiftData(rec.shift_data.value);
          othersHtml += '<div style="margin-bottom:3px;"><span style="font-weight:bold;">' + rec.staff_name.value + '：</span>';
          const ngDays = [];
          for (let d = 1; d <= days; d++) {
            if (data[d] && data[d] !== '○' && data[d] !== '') {
              ngDays.push(d + '日(' + data[d] + ')');
            }
          }
          othersHtml += ngDays.length > 0 ? ngDays.join('、') : 'NG日なし';
          othersHtml += '</div>';
        });
        othersHtml += '</div>';
      }

      // 縦長入力テーブル
      let tableHtml = othersHtml;
      tableHtml += '<table style="border-collapse:collapse;width:100%;">';
      tableHtml += '<tr>';
      tableHtml += '<th style="border:1px solid #ccc;padding:6px;background:#f5f5f5;text-align:center;width:50px;">日</th>';
      tableHtml += '<th style="border:1px solid #ccc;padding:6px;background:#f5f5f5;text-align:center;width:36px;">曜</th>';
      tableHtml += '<th style="border:1px solid #ccc;padding:6px;background:#e8f0eb;text-align:center;">' + myStaff + 'の希望</th>';
      tableHtml += '</tr>';

      for (let d = 1; d <= days; d++) {
        const dow = getDow(currentMonth, d);
        const dowStr = DAYS_JA[dow];
        const dowColor = dowHeaderColor(dow);
        const v = myData[d] || '';
        const bgColor = markColor(v);

        tableHtml += '<tr>';
        tableHtml += '<td style="border:1px solid #ccc;padding:6px;text-align:center;background:' + dowColor + ';">' + d + '</td>';
        tableHtml += '<td style="border:1px solid #ccc;padding:6px;text-align:center;background:' + dowColor + ';">' + dowStr + '</td>';
        tableHtml += '<td style="border:1px solid #ccc;padding:4px;background:' + bgColor + ';">';
        tableHtml += '<select data-day="' + d + '" style="width:100%;border:none;background:transparent;font-size:14px;padding:4px;">';
        MARKS.forEach(function(m) {
          tableHtml += '<option value="' + m + '"' + (m === v ? ' selected' : '') + '>' + m + '</option>';
        });
        tableHtml += '</select></td>';
        tableHtml += '</tr>';
      }
      tableHtml += '</table>';

      // 備考欄
      tableHtml += '<div style="margin-top:12px;">';
      tableHtml += '<label style="font-size:13px;font-weight:bold;">備考</label><br>';
      tableHtml += '<textarea id="bikou-input" style="width:100%;margin-top:4px;padding:6px;border:1px solid #ccc;border-radius:4px;font-size:13px;box-sizing:border-box;" rows="3">' + myBikou + '</textarea>';
      tableHtml += '</div>';

      tableArea.innerHTML = tableHtml;
      saveBtn.style.display = 'inline-block';

      // セレクト変更時に背景色を更新
      tableArea.querySelectorAll('select[data-day]').forEach(function(sel) {
        sel.addEventListener('change', function() {
          this.parentElement.style.background = markColor(this.value);
        });
      });
    }

    function loadData() {
      currentMonth = monthSel.value;
      myStaff = staffSel.value;
      msg.textContent = '読み込み中...';
      fetchRecords(currentMonth, function(err, records) {
        if (err) { msg.textContent = 'エラーが発生しました。'; return; }
        allRecords = records;
        myRecord = records.find(function(r) { return r.staff_name.value === myStaff; }) || null;
        msg.textContent = '';
        renderTable();
      });
    }

    saveBtn.addEventListener('click', function() {
      currentMonth = monthSel.value;
      myStaff = staffSel.value;
      const days = getDaysInMonth(currentMonth);
      const data = {};
      tableArea.querySelectorAll('select[data-day]').forEach(function(sel) {
        data[sel.dataset.day] = sel.value;
      });
      const bikouEl = document.getElementById('bikou-input');
      const bikou = bikouEl ? bikouEl.value : '';
      msg.textContent = '保存中...';
      saveRecord(myRecord, myStaff, currentMonth, data, bikou, function(err) {
        if (err) { msg.textContent = 'エラーが発生しました。'; return; }
        msg.textContent = '保存しました。';
        loadData();
      });
    });

    loadBtn.addEventListener('click', loadData);
    loadData();
  }

  // ===== 一覧・印刷ビュー（横長） =====
  function renderListView() {
    const el = kintone.app.getHeaderSpaceElement();
    el.innerHTML = '';

    const monthOptions = getMonthOptions();
    let currentMonth = monthOptions[1];

    const container = document.createElement('div');
    container.style.cssText = 'padding:16px;font-family:sans-serif;';

    // ヘッダー
    const header = document.createElement('div');
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
    loadBtn.style.cssText = 'background:#4a7c59;color:white;border:none;padding:7px 16px;border-radius:4px;cursor:pointer;font-size:14px;';

    const printBtn = document.createElement('button');
    printBtn.textContent = '印刷';
    printBtn.style.cssText = 'background:#666;color:white;border:none;padding:7px 16px;border-radius:4px;cursor:pointer;font-size:14px;';

    header.appendChild(document.createTextNode('対象月：'));
    header.appendChild(monthSel);
    header.appendChild(loadBtn);
    header.appendChild(printBtn);
    container.appendChild(header);

    const tableArea = document.createElement('div');
    tableArea.style.cssText = 'overflow-x:auto;';
    container.appendChild(tableArea);

    const msg = document.createElement('div');
    msg.style.cssText = 'margin-top:8px;font-size:13px;color:#666;';
    container.appendChild(msg);

    el.appendChild(container);

    function renderTable(records) {
      const days = getDaysInMonth(currentMonth);

      let html = '<table style="border-collapse:collapse;font-size:11px;">';
      // ヘッダー行（日付＋曜日）
      html += '<tr><th style="border:1px solid #ccc;padding:4px 8px;background:#f5f5f5;white-space:nowrap;">スタッフ</th>';
      for (let d = 1; d <= days; d++) {
        const dow = getDow(currentMonth, d);
        const color = dowHeaderColor(dow);
        html += '<th style="border:1px solid #ccc;padding:3px 4px;background:' + color + ';text-align:center;min-width:28px;">' + d + '<br>' + DAYS_JA[dow] + '</th>';
      }
      html += '<th style="border:1px solid #ccc;padding:4px 8px;background:#f5f5f5;">備考</th></tr>';

      // 全スタッフ行
      STAFF_LIST.forEach(function(name) {
        const rec = records.find(function(r) {
          return r.staff_name.value === name && r.target_month.value === currentMonth;
        });
        const data = rec ? parseShiftData(rec.shift_data.value) : {};
        const bikou = rec ? (rec.備考.value || '') : '';
        html += '<tr><td style="border:1px solid #ccc;padding:4px 8px;white-space:nowrap;font-weight:bold;">' + name + '</td>';
        for (let d = 1; d <= days; d++) {
          const v = data[d] || '';
          const bg = markColor(v);
          html += '<td style="border:1px solid #ccc;text-align:center;background:' + bg + ';padding:2px;font-size:10px;">' + v + '</td>';
        }
        html += '<td style="border:1px solid #ccc;padding:4px 8px;font-size:10px;white-space:nowrap;">' + bikou + '</td></tr>';
      });
      html += '</table>';
      tableArea.innerHTML = html;
    }

    function loadData() {
      currentMonth = monthSel.value;
      msg.textContent = '読み込み中...';
      fetchRecords(currentMonth, function(err, records) {
        if (err) { msg.textContent = 'エラーが発生しました。'; return; }
        msg.textContent = '';
        renderTable(records);
      });
    }

    printBtn.addEventListener('click', function() { window.print(); });
    loadBtn.addEventListener('click', loadData);
    loadData();
  }

  // ===== ビュー振り分け =====
  kintone.events.on('app.record.index.show', function(event) {
    if (event.viewName === 'シフト入力') {
      renderInputView();
    } else if (event.viewName === 'シフト一覧') {
      renderListView();
    }
    return event;
  });

})();
