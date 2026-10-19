import Foundation
import CryptoKit

/// Persists which floor plan is active and the user's own plan file.
/// Everything lives in ~/Library/Application Support/HouseControl (or HOUSE_DATA_DIR).
public final class PlanStore {
    public static let bundled = ["home", "studio"]

    public let directory: URL
    public var customPlanURL: URL { directory.appendingPathComponent("plan.json") }
    private var settingsURL: URL { directory.appendingPathComponent("settings.json") }

    /// "home" / "studio" for the bundled demos, or "custom" for plan.json.
    public private(set) var activePlan = "home"

    /// Fired on the main queue when plan.json is replaced by something other than this store
    /// (an installer, a sync job), once it has settled. Call `startWatching()` to arm it.
    public var onCustomPlanChange: (() -> Void)?
    private var watcher: DispatchSourceFileSystemObject?
    private var debounce: DispatchWorkItem?
    private var knownRevision: String?

    public init() {
        // HOUSE_DATA_DIR points the app at another folder: a throw-away one for testing or
        // screenshots leaves the real plan and the Smart Life session alone.
        if let custom = ProcessInfo.processInfo.environment["HOUSE_DATA_DIR"], !custom.isEmpty {
            directory = URL(fileURLWithPath: (custom as NSString).expandingTildeInPath, isDirectory: true)
        } else {
            let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            directory = base.appendingPathComponent("HouseControl", isDirectory: true)
        }
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        if let data = try? Data(contentsOf: settingsURL),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let plan = json["plan"] as? String {
            activePlan = plan
        }
        if activePlan == "custom", customPlan() == nil { activePlan = "home" }
    }

    /// Watches the data folder rather than the file: an atomic replace (temp file + mv)
    /// swaps the inode, which a watch on plan.json itself would lose.
    public func startWatching() {
        guard watcher == nil else { return }
        let fd = open(directory.path, O_EVTONLY)
        guard fd >= 0 else { return }
        knownRevision = customPlanRevision
        let source = DispatchSource.makeFileSystemObjectSource(fileDescriptor: fd, eventMask: .write, queue: .main)
        source.setEventHandler { [weak self] in self?.folderChanged() }
        source.setCancelHandler { close(fd) }
        source.resume()
        watcher = source
    }

    private func folderChanged() {
        debounce?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.customPlanRevision != self.knownRevision else { return }
            self.knownRevision = self.customPlanRevision
            self.onCustomPlanChange?()
        }
        debounce = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3, execute: work)
    }

    public func customPlan() -> [String: Any]? {
        guard let data = try? Data(contentsOf: customPlanURL) else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }

    public var hasCustomPlan: Bool { FileManager.default.fileExists(atPath: customPlanURL.path) }

    /// The name the user gave their home, for menus.
    public var customPlanName: String? { customPlan()?["name"] as? String }

    /// Fingerprint of the user's plan as stored; two devices holding the same revision
    /// have nothing to exchange.
    public var customPlanRevision: String? {
        (try? Data(contentsOf: customPlanURL)).map(Self.revision(of:))
    }

    public static func revision(of data: Data) -> String {
        SHA256.hash(data: data).prefix(8).map { String(format: "%02x", $0) }.joined()
    }

    private func settings() -> [String: Any] {
        guard let data = try? Data(contentsOf: settingsURL) else { return [:] }
        return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }

    /// The interface language an installer pinned in settings.json ("en" or "ru"); nil leaves
    /// the choice to the web UI.
    public var lang: String? {
        guard let lang = settings()["lang"] as? String, ["en", "ru"].contains(lang) else { return nil }
        return lang
    }

    public func select(_ plan: String) {
        guard Self.bundled.contains(plan) || (plan == "custom" && customPlan() != nil) else { return }
        activePlan = plan
        // Read-modify-write: other keys (the language, anything newer) must survive.
        var stored = settings()
        stored["plan"] = plan
        let data = try? JSONSerialization.data(withJSONObject: stored)
        try? data?.write(to: settingsURL, options: .atomic)
    }

    /// Stores `plan` as the user's plan and makes it active.
    public func saveCustom(_ plan: [String: Any]) throws {
        try saveCustom(data: Self.encode(plan))
    }

    /// Stores an already serialised plan byte for byte, so its revision matches the sender's.
    public func saveCustom(data: Data, select: Bool = true) throws {
        try data.write(to: customPlanURL, options: .atomic)
        if watcher != nil { knownRevision = customPlanRevision } // our own save is not news
        if select { self.select("custom") }
    }

    public static func encode(_ plan: [String: Any]) throws -> Data {
        try JSONSerialization.data(withJSONObject: plan, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
    }

    /// Checks that `data` is a floor plan at all before it replaces the user's one.
    public static func validate(_ data: Data) throws -> [String: Any] {
        guard let plan = try JSONSerialization.jsonObject(with: data) as? [String: Any], plan["rooms"] is [Any] else {
            throw NSError(domain: "HouseControl", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "This file is not a House Control floor plan (no \"rooms\" list)."])
        }
        return plan
    }

    public func importPlan(from url: URL) throws {
        try saveCustom(Self.validate(try Data(contentsOf: url)))
    }

    /// Forgets the user's plan and falls back to the bundled demo.
    public func removeCustom() {
        try? FileManager.default.removeItem(at: customPlanURL)
        if watcher != nil { knownRevision = nil }
        if activePlan == "custom" { select("home") }
    }

    /// The plan the UI should render: the custom JSON inline, or the name of a bundled demo.
    public func bootPayload() -> [String: Any] {
        var boot: [String: Any] = ["plan": activePlan, "hasCustomPlan": hasCustomPlan]
        if activePlan == "custom", let plan = customPlan() { boot["config"] = plan }
        if let lang { boot["lang"] = lang }
        return boot
    }
}
