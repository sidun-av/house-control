import XCTest
@testable import HouseCore

final class PlanStoreLangTests: XCTestCase {
    private var folder: URL!

    override func setUp() {
        folder = FileManager.default.temporaryDirectory.appendingPathComponent("hc-lang-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        setenv("HOUSE_DATA_DIR", folder.path, 1)
    }

    override func tearDown() {
        unsetenv("HOUSE_DATA_DIR")
        try? FileManager.default.removeItem(at: folder)
    }

    private func write(_ json: String) {
        try? Data(json.utf8).write(to: folder.appendingPathComponent("settings.json"))
    }

    func testLanguageReachesTheBootPayload() {
        write(#"{"plan":"home","lang":"ru"}"#)
        let store = PlanStore()
        XCTAssertEqual(store.lang, "ru")
        XCTAssertEqual(store.bootPayload()["lang"] as? String, "ru")
    }

    func testUnknownLanguageIsIgnored() {
        write(#"{"lang":"xx"}"#)
        let store = PlanStore()
        XCTAssertNil(store.lang)
        XCTAssertNil(store.bootPayload()["lang"])
    }

    func testSelectKeepsTheLanguage() throws {
        write(#"{"plan":"studio","lang":"ru","other":1}"#)
        let store = PlanStore()
        store.select("home")
        let data = try Data(contentsOf: folder.appendingPathComponent("settings.json"))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(json["plan"] as? String, "home")
        XCTAssertEqual(json["lang"] as? String, "ru")
        XCTAssertEqual(json["other"] as? Int, 1)
    }

    func testPlanArrivingAfterSettingsBecomesActive() throws {
        write(#"{"plan":"custom","lang":"ru"}"#)
        let store = PlanStore()
        XCTAssertEqual(store.activePlan, "home")
        XCTAssertFalse(store.refreshFromDisk())

        let temp = folder.appendingPathComponent("plan.json.tmp")
        try Data(#"{"name":"Demo","rooms":[]}"#.utf8).write(to: temp)
        try FileManager.default.moveItem(at: temp, to: store.customPlanURL)
        XCTAssertTrue(store.refreshFromDisk())
        XCTAssertEqual(store.activePlan, "custom")
        XCTAssertFalse(store.refreshFromDisk())
    }

    func testDeletedPlanFallsBackToTheDemo() throws {
        write(#"{"plan":"custom"}"#)
        try Data(#"{"name":"Demo","rooms":[]}"#.utf8).write(to: folder.appendingPathComponent("plan.json"))
        let store = PlanStore()
        XCTAssertEqual(store.activePlan, "custom")
        try FileManager.default.removeItem(at: store.customPlanURL)
        XCTAssertTrue(store.refreshFromDisk())
        XCTAssertEqual(store.activePlan, "home")
    }
}
