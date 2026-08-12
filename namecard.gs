// ══════════════════════════════════════════════
// namecard.gs — 한글 우선 지시어 및 다중 명함 일괄 검출
// ══════════════════════════════════════════════

function getActiveConfig_() {
  var props = PropertiesService.getScriptProperties().getProperties();
  return {
    FOLDER_NAME: (props.FOLDER_NAME || 'Namecard_Images').trim(),
    DONE_FOLDER: (props.DONE_FOLDER || 'Namecard_Done').trim(),
    SHEET_NAME: 'db_namecards',
    LOG_SHEET: 'processed_log',
    GEMINI_MODEL: (props.GEMINI_MODEL || 'gemini-3.1-flash-lite').trim(),
    GEMINI_API_KEY: (props.GEMINI_API_KEY || '').trim()
  };
}

function scanNewNamecards() {
  // 인가 검사: 시간 트리거(무인 실행)는 활성 사용자가 없어 통과, 사람이 google.script.run으로 직접 호출하면 admin만 허용
  var activeEmail = '';
  try { activeEmail = Session.getActiveUser().getEmail() || ''; } catch (authErr) { activeEmail = ''; }
  if (activeEmail && getUserRole(activeEmail) !== 'admin') throw new Error('권한 없음');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    Logger.log('🔒 이전 프로세스가 아직 실행 중입니다. 안전을 위해 스캔을 중단합니다.');
    return;
  }
  
  try {
    var config = getActiveConfig_();
    var folder = getDriveFolder_(config.FOLDER_NAME);
    if (!folder) {
      Logger.log('❌ 폴더를 찾을 수 없습니다: ' + config.FOLDER_NAME);
      return;
    }

    var logSheet = getLogSheet_();
    var logState = getLogState_(logSheet);
    var files = folder.getFiles();
    var count = 0;

    while (files.hasNext()) {
      var file = files.next();
      var fileId = file.getId();

      if (logState.skip[fileId]) continue;
      if (!isImageFile_(file)) continue;

      try {
        Logger.log('🚀 명함 신규 분석 시도: ' + file.getName());
        processSingleFile_(file, logSheet, logState);
        count++;
        
        if (count >= 5) {
          Logger.log('⏱️ 트랜잭션 제한치 도달. 안전 종료 처리합니다.');
          break;
        }
      } catch (e) {
        Logger.log('❌ 파일 연동 예외 발생 [' + file.getName() + ']: ' + e.toString());
        try {
          var _n = (logState.attempts[fileId] || 0) + 1;
          var _st = (_n >= 3) ? 'FAILED' : 'RETRY';
          writeLogState_(logSheet, logState, fileId, _st, _n);
          if (_st === 'FAILED') Logger.log('⛔ 3회 연속 실패로 재시도를 중단합니다: ' + file.getName());
        } catch (le) { Logger.log('실패 기록 오류: ' + le.toString()); }
      }
    }
  } finally {
    lock.releaseLock();
  }
}

function processSingleFile_(file, logSheet, logState) {
  var config = getActiveConfig_();
  if (!config.GEMINI_API_KEY) throw new Error('API Key가 비어있습니다.');

  var fileId = file.getId();
  var blob = file.getBlob();
  var base64Data = Utilities.base64Encode(blob.getBytes());
  var mimeType = file.getMimeType() || blob.getContentType() || 'image/jpeg';

  var rawJson = callGeminiVision_(base64Data, mimeType);
  var cardsList = parseGeminiOutput_(rawJson); Logger.log('🔎 [' + file.getName() + '] 검출 명함 수: ' + cardsList.length);

  var viewUrl = 'https://drive.google.com/uc?export=view&id=' + file.getId();
  // 파일 이동은 저장 완료 후 수행 (데이터 유실 방지)

  var saved = 0;
  for (var i = 0; i < cardsList.length; i++) {
    var card = cardsList[i];
    if (card.name || card.company) {
      saveOrUpdateNamecard_(card, viewUrl);
      saved++;
    }
  }
  if (saved === 0) throw new Error('추출된 명함 정보가 없습니다(0건) — 완료 처리하지 않고 재시도 대상으로 남깁니다.');
  writeLogState_(logSheet, logState, fileId, 'OK', (logState.attempts[fileId] || 0) + 1); try { moveFileToDoneFolder_(file); } catch (mvErr) { Logger.log('파일 이동 실패(데이터는 저장됨): ' + mvErr.toString()); }
}

function callGeminiVision_(base64Data, mimeType) {
  var config = getActiveConfig_();
  var cleanKey = encodeURIComponent(config.GEMINI_API_KEY.replace(/[\s\t\r\n]/g, ''));
  var cleanModel = encodeURIComponent(config.GEMINI_MODEL.replace(/[\s\t\r\n]/g, ''));
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + cleanModel + ':generateContent';

  // 한글 최우선 처리 및 다중 명함 감지 지시어 고도화
  var systemInstruction = 
    "You are a professional Business Card OCR parser specialized in multi-object detection. " +
    "Analyze the image and locate ALL distinct business cards present in the image. " +
    "Extract the information from EACH identified business card and return a single valid JSON object containing an array of cards. " +
    "DO NOT wrap the JSON in markdown blocks like ```json ... ```. " +
    "Return the raw JSON string directly. Use the exact JSON format below:\n" +
    "{\n  \"cards\": [\n    {\n      \"company\": \"Company name or organization\",\n      \"name\": \"Person's name\",\n      \"title\": \"Job title or position\",\n      \"phone\": \"Office/Representative phone number\",\n      \"mobile\": \"Personal mobile phone number\",\n      \"email\": \"Email address\",\n      \"address\": \"Full office address\"\n    }\n  ]\n}\n" +
    "Rules:\n" +
    "- Detect every single card. Do not omit any cards in the photo.\n" +
    "- [CRITICAL] If both Korean (한글) and English exist on the card, YOU MUST ABSOLUTELY PRIORITIZE extracting the Korean text for company, name, title, and address.\n" +
    "- If a field is not found on a card, use an empty string.\n" +
    "- Clean and format phone/mobile numbers (e.g., 010-1234-5678, 02-123-4567).\n" +
    "- Remove any prefix labels (like Tel, HP, Email) from the extracted field values.";

  var payload = {
    contents: [{ parts: [{ text: "Locate and extract all distinct business cards from this image." }, { inlineData: { mimeType: mimeType, data: base64Data } }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8192 }
  };

  var options = { method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': decodeURIComponent(cleanKey) }, payload: JSON.stringify(payload), muteHttpExceptions: true };
  var response = null, responseCode = null, lastError = null;

  for (var i = 0; i < 3; i++) {
    try {
      response = UrlFetchApp.fetch(url, options);
      responseCode = response.getResponseCode();
      if (responseCode === 200) { lastError = null; break; } 
      else { var _et=''; try { var _ej=JSON.parse(response.getContentText()); if (_ej && _ej.error) _et=String(_ej.error.status||'')+' '+String(_ej.error.message||'').slice(0,200); } catch(_e) {} lastError = new Error('HTTP ' + responseCode + (_et ? ' (' + _et + ')' : '')); if (responseCode >= 400 && responseCode < 500) break; }
    } catch (err) {
      lastError = err; Utilities.sleep(Math.pow(2, i) * 1000);
    }
  }
  if (responseCode !== 200) { var _m = (lastError ? lastError.toString() : 'Network Error'); _m = _m.replace(/AIza[0-9A-Za-z_-]+/g, '[KEY]'); try { var _k = decodeURIComponent(cleanKey); if (_k) _m = _m.split(_k).join('[KEY]'); } catch(_e) {} throw new Error('Gemini 연동 중 예외: ' + _m); }
  return response.getContentText();
}

function parseGeminiOutput_(responseText) {
  try {
    var res = JSON.parse(responseText);
    if (!res.candidates || !res.candidates.length) throw new Error('Gemini 응답에 후보 결과가 없습니다(안전필터 차단 등): ' + String(responseText).substring(0, 300)); var textOutput = res.candidates[0].content.parts[0].text;
    textOutput = textOutput.replace(/```json/g, '').replace(/```/g, '').trim();
    var parsed = JSON.parse(textOutput);
    if (parsed.cards && Array.isArray(parsed.cards)) return parsed.cards;
    else if (Array.isArray(parsed)) return parsed;
    else if (parsed && (parsed.name || parsed.company)) return [parsed];
    else return [];
  } catch (e) {
    throw new Error('JSON 파싱 오류: ' + e.toString());
  }
}

// ── 보안/무결성 헬퍼 (밑줄 접미사: google.script.run 노출 차단) ──
function sanitizeCell_(v) {
  var s = (v === null || v === undefined) ? '' : String(v);
  var c = s.charAt(0);
  return (c === '=' || c === '+' || c === '-' || c === '@') ? "'" + s : s;
}

function isGenericEmail_(e) {
  if (!e) return false;
  var local = String(e).split('@')[0].toLowerCase().replace(/[^a-z]/g, '');
  return ['info','contact','sales','support','help','admin','office','master','cs','service','mail','webmaster','hello','marketing','pr'].indexOf(local) !== -1;
}

function getLogState_(logSheet) {
  var rows = logSheet.getDataRange().getValues().slice(1);
  var st = { skip: {}, attempts: {}, row: {} };
  for (var i = 0; i < rows.length; i++) {
    var id = String(rows[i][0] || ''); if (!id) continue;
    var status = String(rows[i][2] || 'OK');
    st.row[id] = i + 2;
    st.attempts[id] = Number(rows[i][3] || 0);
    if (status === 'OK' || status === 'FAILED') st.skip[id] = true;
  }
  return st;
}

function writeLogState_(logSheet, state, fileId, status, attempts) {
  var ts = new Date().toISOString();
  if (state.row[fileId]) logSheet.getRange(state.row[fileId], 2, 1, 3).setValues([[ ts, status, attempts ]]);
  else { logSheet.appendRow([ fileId, ts, status, attempts ]); state.row[fileId] = logSheet.getLastRow(); }
  state.attempts[fileId] = attempts;
  if (status === 'OK' || status === 'FAILED') state.skip[fileId] = true;
}

function saveOrUpdateNamecard_(card, imageUrl) {
  var config = getActiveConfig_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(config.SHEET_NAME);
  if (!sheet) throw new Error('DB 탐색 실패');

  var data = sheet.getDataRange().getValues();
  var matchRowIndex = -1, isCareerChange = false, oldCompany = '', oldTitle = '';
  var targetName = card.name ? String(card.name).trim() : '';
  var targetPhone = card.phone ? String(card.phone).replace(/[^0-9]/g, '') : '';
  var targetMobile = card.mobile ? String(card.mobile).replace(/[^0-9]/g, '') : '';
  var targetEmail = card.email ? String(card.email).trim().toLowerCase() : '';
  var targetCompany = card.company ? String(card.company).trim() : '';

  for (var i = 1; i < data.length; i++) {
    var existingCompany = String(data[i][2]).trim();
    var existingName    = String(data[i][3]).trim();
    var existingTitle   = String(data[i][4]).trim();
    var existingPhone   = String(data[i][5]).replace(/[^0-9]/g, '');
    var existingMobile  = String(data[i][6]).replace(/[^0-9]/g, '');
    var existingEmail   = String(data[i][7]).trim().toLowerCase();

    if (targetName && targetMobile && targetName === existingName && targetMobile === existingMobile) {
      if (targetCompany && targetCompany !== existingCompany) {
        matchRowIndex = i + 1; isCareerChange = true; oldCompany = existingCompany; oldTitle = existingTitle; break;
      }
    }
    // 이메일/휴대폰이 같아도 이름이 다르면 동일인이 아니다 (공용 이메일·번호 재배정으로 인한 타인 행 덮어쓰기 방지)
    if (targetName && targetName === existingName &&
        ((targetEmail && !isGenericEmail_(targetEmail) && targetEmail === existingEmail) ||
         (targetMobile && targetMobile === existingMobile))) {
      matchRowIndex = i + 1; break;
    }

    // 개인 연락처(휴대폰/이메일)가 없는 명함: 양쪽 모두 없을 때만 이름+회사+전화번호로 동일인 판정
    if (!targetMobile && !targetEmail && !existingMobile && !existingEmail &&
        targetName && targetCompany && targetPhone &&
        targetName === existingName && targetCompany === existingCompany && targetPhone === existingPhone) {
      matchRowIndex = i + 1; break;
    }
  }

  if (matchRowIndex !== -1) {
    if (isCareerChange) {
      recordCareerHistory_(targetName, card.mobile, oldCompany, oldTitle, targetCompany, card.title);
      sheet.getRange(matchRowIndex, 2, 1, 10).setValues([[ new Date().toISOString(), sanitizeCell_(card.company), sanitizeCell_(card.name), sanitizeCell_(card.title), sanitizeCell_(card.phone), sanitizeCell_(card.mobile), sanitizeCell_(card.email), sanitizeCell_(card.address), imageUrl, 'CAREER_CHANGED' ]]);
    } else {
      sheet.getRange(matchRowIndex, 2, 1, 10).setValues([[ new Date().toISOString(), sanitizeCell_(card.company), sanitizeCell_(card.name), sanitizeCell_(card.title), sanitizeCell_(card.phone), sanitizeCell_(card.mobile), sanitizeCell_(card.email), sanitizeCell_(card.address), imageUrl, 'UPDATED' ]]);
    }
  } else {
    sheet.appendRow([ Utilities.getUuid(), new Date().toISOString(), sanitizeCell_(card.company), sanitizeCell_(card.name), sanitizeCell_(card.title), sanitizeCell_(card.phone), sanitizeCell_(card.mobile), sanitizeCell_(card.email), sanitizeCell_(card.address), imageUrl, 'NEW' ]);
  }
}

function recordCareerHistory_(name, mobile, oldCompany, oldTitle, newCompany, newTitle) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('db_careers');
  if (!sheet) {
    sheet = ss.insertSheet('db_careers');
    sheet.appendRow(['이름', '휴대폰', '이전 회사', '이전 직책', '신규 회사', '신규 직책', '이직 기록 일시']);
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#111116').setFontColor('#c9a84c').setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([sanitizeCell_(name), sanitizeCell_(mobile), sanitizeCell_(oldCompany || '-'), sanitizeCell_(oldTitle || '-'), sanitizeCell_(newCompany || '-'), sanitizeCell_(newTitle || '-'), new Date().toISOString()]);
}

function moveFileToDoneFolder_(file) {
  var config = getActiveConfig_();
  var doneFolder = getDriveFolder_(config.DONE_FOLDER);
  if (!doneFolder) {
    var parentFolder = file.getParents().hasNext() ? file.getParents().next() : DriveApp.getRootFolder();
    doneFolder = parentFolder.createFolder(config.DONE_FOLDER);
  }
  file.moveTo(doneFolder);
  /* SECURITY: no public link. Images are served only via getNamecardImage() after a role check. */
}
function getDriveFolder_(folderName) { var folders = DriveApp.getFoldersByName(folderName); return folders.hasNext() ? folders.next() : null; }
function isImageFile_(file) { var mime = file.getMimeType(); return mime.startsWith('image/') || mime === 'application/pdf'; }
function getLogSheet_() { var ss = SpreadsheetApp.getActiveSpreadsheet(); var sheet = ss.getSheetByName(getActiveConfig_().LOG_SHEET); if (!sheet) { sheet = ss.insertSheet(getActiveConfig_().LOG_SHEET); sheet.appendRow(['fileId', 'processedAt', 'status', 'attempts']); } return sheet; }

function revokePublicSharing() {
  var cur = getCurrentUser();
  if (cur.role !== 'admin') throw new Error('권한 없음');
  var config = getActiveConfig_();
  var ids = {};
  var names = [config.FOLDER_NAME, config.DONE_FOLDER];
  for (var n = 0; n < names.length; n++) {
    var it = DriveApp.getFoldersByName(names[n]);
    while (it.hasNext()) { ids[it.next().getId()] = true; }
  }
  ids['1t1SLQ6p5NjeUjg_2yedvY6qOOLDiyIUN'] = true;

  var fixed = 0, already = 0, failed = 0, scanned = 0, folders = 0;
  var keys = Object.keys(ids);
  for (var k = 0; k < keys.length; k++) {
    var folder = null;
    try { folder = DriveApp.getFolderById(keys[k]); } catch (e) { continue; }
    folders++;
    var files = folder.getFiles();
    while (files.hasNext()) {
      var f = files.next();
      scanned++;
      try {
        if (f.getSharingAccess() === DriveApp.Access.PRIVATE) { already++; continue; }
        f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
        fixed++;
      } catch (e2) { failed++; }
    }
  }
  var msg = '폴더 ' + folders + ' / 검사 ' + scanned + ' / 비공개전환 ' + fixed + ' / 이미비공개 ' + already + ' / 실패 ' + failed;
  Logger.log(msg);
  return msg;
}
