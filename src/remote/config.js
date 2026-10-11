// Public deployment configuration only. The dedicated BFF owns OAuth credentials.
// Configure reviewed same-origin BFF paths after its contract and channel qualification.
window.CODEVALANCHE_REMOTE = {
  enabled: false,
  origin: null,
  paths: {},
  channelQualified: false,
  discoveryEnabled: false,
  localQualification: false,
  runEnabled: false,
  authorizationOrigins: [],
};
