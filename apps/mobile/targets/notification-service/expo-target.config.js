// The Notification Service Extension that draws a chat push as a message from
// its sender, with their profile photo (#6024). `@bacons/apple-targets` adds it
// to the Xcode project at prebuild and lists it in
// `extra.eas.build.experimental.ios.appExtensions`, so EAS signs it.
//
// Its bundle ID is the app's plus `.NotificationService`:
// `live.frapp.mobile.NotificationService`, and
// `live.frapp.mobile.staging.NotificationService` for Frapp Staging. Each needs
// a provisioning profile on EAS before a non-interactive build can sign it
// (`eas credentials -p ios`, once per bundle ID).
//
// 16.4 is the app's own deployment target (what prebuild writes for the app
// target); communication notifications need iOS 15.

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = () => ({
  type: "notification-service",
  name: "NotificationService",
  bundleIdentifier: ".NotificationService",
  deploymentTarget: "16.4",
  frameworks: ["Intents", "UserNotifications"],
});
