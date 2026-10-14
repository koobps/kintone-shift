(function() {
  'use strict';

  const APP_ID = kintone.app.getId();
  const STAFF_LIST = ['正田', '濱垣', '鶴原', '鳥羽', '店長'];
  const MARKS = ['○', '△', '×', '公休', ''];

  // 対象年月の取得（今月をデフォルト）
  function getCurrentMonth() {
    const d = new Date();
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  }

  // 対象年月から日数を取得
  function getDaysInMonth(yearMonth) {
    const match = yearMonth.match(/(\d+)年(\d+)月/);
    if (!match) return 31;
    return new Date(parseInt(match[1]), parseInt(match[2]), 0).getDate();
  }

  // shift_dataのJSONをパース
  function parseShiftData(raw) {
    try { return JSON.parse(raw); } catch(e) { return {}; }
  }

  // カスタマイズビュー
  kintone.events.on('app.record.index.show', function(event) {

    const el = kintone.app.getHeaderSpaceElement();
    el.innerHTML = '';

    let currentMonth = getCurrentMonth();
    let myStaff = STAFF_LIST[0];
    let allRecords = [];
    let myRecord = null;

    // UI構築
    const container = document.createElement('div');
    container.style.cssText = 'padding:16px;font-family:sans-serif;';

    // ヘッダー
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;';

    // 月選択
    const monthInput = document.createElement('input');
    monthInput.type = 'text';
    monthInput.value = currentMonth;
    monthInput.placeholder = '例：2026年10月';
    monthInput.style.cssText = 'border:1px solid #ccc;padding:6px 10px;border-radius:4px;font-size:14px;width:130px;';

    // スタッフ選択
    const staffSel = document.createElement('select');
    staffSel.style.cssText = 'border:1px solid #ccc;padding:6px 10px;border-radius:4px;font-size:14px;';
    STAFF_LIST.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      staffSel.appendChild(opt);
    });

    // 読み込みボタン
    const loadBtn = document.createElement('button');
    loadBtn.textContent = '読み込む';
    loadBtn.style.cssText = 'background:#4a7c59;color:white;border:none;padding:7px 16px;border-radius:4px;cursor:pointer;font-size:14px;';

    header.appendChild(document.createTextNode('対象月：'));
    header.appendChild(monthInput);
    header.appendChild(document.createTextNode('　自分：'));
    header.appendChild(staffSel);
    header.appendChild(loadBtn);
    container.appendChild(header);

    // テーブル領域
    const tableArea = document.createElement('div');
    tableArea.style.cssText = 'overflow-x:auto;';
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

    // テーブル描画
    function renderTable() {
      currentMonth = monthInput.value.trim();
      myStaff = staffSel.value;
      const days = getDaysInMonth(currentMonth);
      const myData = myRecord ? parseShiftData(myRecord.shift_data.value) : {};

      let html = '<table style="border-collapse:collapse;min-width:600px;">';
      // ヘッダー行
      html += '<tr><th style="border:1px solid #ccc;padding:6px 10px;background:#f5f5f5;white-space:nowrap;">スタッフ</th>';
      for (let d = 1; d <= days; d++) {
        html += `<th style="border:1px solid #ccc;padding:4px 6px;background:#f5f5f5;text-align:center;min-width:36px;">${d}</th>`;
      }
      html += '</tr>';

      // 他スタッフの行（読み取り専用）
      allRecords.forEach(rec => {
        if (rec.staff_name.value === myStaff) return;
        if (rec.target_month.value !== currentMonth) return;
        const data = parseShiftData(rec.shift_data.value);
        html += `<tr><td style="border:1px solid #ccc;padding:6px 10px;white-space:nowrap;font-weight:bold;">${rec.staff_name.value}</td>`;
        for (let d = 1; d <= days; d++) {
          const v = data[d] || '';
          const color = v === '○' ? '#e8f5e9' : v === '×' ? '#ffebee' : v === '△' ? '#fff9c4' : '';
          html += `<td style="border:1px solid #ccc;text-align:center;background:${color};">${v}</td>`;
        }
        html += '</tr>';
      });

      // 自分の行（入力可能）
      html += `<tr><td style="border:1px solid #ccc;padding:6px 10px;white-space:nowrap;font-weight:bold;background:#e8f0eb;">${myStaff}（自分）</td>`;
      for (let d = 1; d <= days; d++) {
        const v = myData[d] || '';
        html += `<td style="border:1px solid #ccc;padding:2px;background:#f0f7f0;">
          <select data-day="${d}" style="width:44px;border:none;background:transparent;text-align:center;font-size:13px;">
            ${MARKS.map(m => `<option value="${m}" ${m === v ? 'selected' : ''}>${m}</option>`).join('')}
          </select></td>`;
      }
      html += '</tr></table>';

      tableArea.innerHTML = html;
      saveBtn.style.display = 'inline-block';
    }

    // データ読み込み
    function loadData() {
      currentMonth = monthInput.value.trim();
      myStaff = staffSel.value;
      msg.textContent = '読み込み中...';

      kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
        app: APP_ID,
        query: `target_month = "${currentMonth}" order by staff_name asc`,
        fields: ['$id', 'staff_name', 'target_month', 'shift_data']
      }).then(function(resp) {
        allRecords = resp.records;
        myRecord = allRecords.find(r => r.staff_name.value === myStaff) || null;
        msg.textContent = '';
        renderTable();
      }).catch(function(err) {
        msg.textContent = 'エラー：' + JSON.stringify(err);
      });
    }

    // 保存処理
    saveBtn.addEventListener('click', function() {
      currentMonth = monthInput.value.trim();
      myStaff = staffSel.value;
      const days = getDaysInMonth(currentMonth);
      const data = {};
      tableArea.querySelectorAll('select[data-day]').forEach(sel => {
        data[sel.dataset.day] = sel.value;
      });

      const body = {
        app: APP_ID,
        record: {
          staff_name: { value: myStaff },
          target_month: { value: currentMonth },
          shift_data: { value: JSON.stringify(data) }
        }
      };

      msg.textContent = '保存中...';

      if (myRecord) {
        // 更新
        kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', {
          app: APP_ID,
          id: myRecord.$id.value,
          record: body.record
        }).then(function() {
          msg.textContent = '保存しました。';
          loadData();
        }).catch(function(err) {
          msg.textContent = 'エラー：' + JSON.stringify(err);
        });
      } else {
        // 新規作成
        kintone.api(kintone.api.url('/k/v1/record', true), 'POST', body)
        .then(function() {
          msg.textContent = '保存しました。';
          loadData();
        }).catch(function(err) {
          msg.textContent = 'エラー：' + JSON.stringify(err);
        });
      }
    });

    loadBtn.addEventListener('click', loadData);
    loadData();

    return event;
  });
})();
