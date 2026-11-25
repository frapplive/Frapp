import Intents
import UIKit
import UserNotifications

/// Draws a Frapp chat push as a message from its sender, with their profile
/// photo as the avatar and the Frapp icon as its badge: an Apple communication
/// notification, the way iMessage and WhatsApp draw theirs (#6024).
///
/// The API marks a chat push from a named member `mutable-content` and puts
/// who it is from in its data as `communication`:
/// `{ senderId, senderName, senderImageUrl?, groupName? }`. Expo delivers a
/// push's data as the payload's `body`. A push without it, a photo that fails
/// to load, or an intent iOS refuses all fall back to showing the push as it
/// arrived, so the extension can cost a push its photo but never its text.
class NotificationService: UNNotificationServiceExtension {
  /// Seconds the photo download may take. iOS gives the extension about 30
  /// in all; a push that waits longer than this arrives without the photo.
  private static let imageTimeout: TimeInterval = 8

  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var original: UNNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    self.contentHandler = contentHandler
    original = request.content

    guard let communication = Communication(userInfo: request.content.userInfo) else {
      finish(with: request.content)
      return
    }

    loadImage(communication.senderImageUrl) { [weak self] image in
      guard let self = self else { return }
      self.present(request.content, from: communication, image: image)
    }
  }

  override func serviceExtensionTimeWillExpire() {
    if let original = original {
      finish(with: original)
    }
  }

  /// Hands iOS the content to show, once: whichever of the update and the
  /// expiry gets here first wins, on the main queue so they can't race.
  private func finish(with content: UNNotificationContent) {
    DispatchQueue.main.async {
      guard let handler = self.contentHandler else { return }
      self.contentHandler = nil
      handler(content)
    }
  }

  private func present(
    _ content: UNNotificationContent,
    from communication: Communication,
    image: INImage?
  ) {
    // Name components as well as the display name, so a sender with no
    // photo gets their initials rather than a blank silhouette.
    let sender = INPerson(
      personHandle: INPersonHandle(value: communication.senderId, type: .unknown),
      nameComponents: PersonNameComponentsFormatter().personNameComponents(
        from: communication.senderName
      ),
      displayName: communication.senderName,
      image: image,
      contactIdentifier: nil,
      customIdentifier: communication.senderId
    )

    // A conversation with a name is a group: iOS counts the sender and the
    // reader itself, so one more recipient makes three. The chapter's members
    // never reach the phone, so that recipient stands for the rest of them.
    var recipients: [INPerson]? = nil
    var groupName: INSpeakableString? = nil
    if let name = communication.groupName {
      groupName = INSpeakableString(spokenPhrase: name)
      recipients = [
        INPerson(
          personHandle: INPersonHandle(value: conversationId(content, communication), type: .unknown),
          nameComponents: nil,
          displayName: name,
          image: nil,
          contactIdentifier: nil,
          customIdentifier: nil
        )
      ]
    }

    let intent = INSendMessageIntent(
      recipients: recipients,
      outgoingMessageType: .outgoingMessageText,
      content: content.body,
      speakableGroupName: groupName,
      conversationIdentifier: conversationId(content, communication),
      serviceName: nil,
      sender: sender,
      attachments: nil
    )
    // A group's avatar is its own image when it has one; Frapp's channels
    // have none, so the sender's photo stands in, as it does in a DM.
    if groupName != nil, let image = image {
      intent.setImage(image, forParameterNamed: \.speakableGroupName)
    }
    if communication.mentioned {
      let metadata = INSendMessageIntentDonationMetadata()
      metadata.mentionsCurrentUser = true
      // The metadata's count replaces the recipients array's, so it repeats
      // it: left at its default, a mention in a channel could read as a DM.
      metadata.recipientCount = recipients?.count ?? 0
      intent.donationMetadata = metadata
    }

    let interaction = INInteraction(intent: intent, response: nil)
    interaction.direction = .incoming
    interaction.donate { [weak self] _ in
      // A failed donation still tries the update: it only costs Siri's
      // suggestions, and the update is what draws the photo.
      guard let self = self else { return }
      if let updated = try? content.updating(from: intent) {
        self.finish(with: updated)
      } else {
        self.finish(with: content)
      }
    }
  }

  /// One per conversation, so iOS keeps a channel's pushes together: the
  /// push's own stack (`chat:<channelId>`), else the sender.
  private func conversationId(
    _ content: UNNotificationContent,
    _ communication: Communication
  ) -> String {
    let thread = content.threadIdentifier
    return thread.isEmpty ? communication.senderId : thread
  }

  private func loadImage(_ url: URL?, completion: @escaping (INImage?) -> Void) {
    guard let url = url else {
      completion(nil)
      return
    }
    var request = URLRequest(url: url)
    request.timeoutInterval = Self.imageTimeout
    URLSession.shared.dataTask(with: request) { data, response, _ in
      guard
        let data = data,
        let http = response as? HTTPURLResponse,
        (200..<300).contains(http.statusCode),
        UIImage(data: data) != nil
      else {
        completion(nil)
        return
      }
      completion(INImage(imageData: data))
    }.resume()
  }
}

/// What the API's `PushCommunication` carries, read from the push's data.
private struct Communication {
  let senderId: String
  let senderName: String
  let senderImageUrl: URL?
  let groupName: String?
  /// `data.mentioned`: the message @-mentions the reader.
  let mentioned: Bool

  init?(userInfo: [AnyHashable: Any]) {
    guard
      let data = userInfo["body"] as? [String: Any],
      let communication = data["communication"] as? [String: Any],
      let senderId = communication["senderId"] as? String, !senderId.isEmpty,
      let senderName = communication["senderName"] as? String, !senderName.isEmpty
    else { return nil }
    self.senderId = senderId
    self.senderName = senderName
    if let url = communication["senderImageUrl"] as? String,
       let parsed = URL(string: url),
       parsed.scheme == "https" {
      senderImageUrl = parsed
    } else {
      senderImageUrl = nil
    }
    if let name = communication["groupName"] as? String, !name.isEmpty {
      groupName = name
    } else {
      groupName = nil
    }
    mentioned = data["mentioned"] as? Bool ?? false
  }
}
