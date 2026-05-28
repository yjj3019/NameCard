function createTimeTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'scanNewNamecards')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('scanNewNamecards')
    .timeBased()
    .everyMinutes(1)
    .create();

  Logger.log('✅ 트리거 등록: 1분 간격');
}
