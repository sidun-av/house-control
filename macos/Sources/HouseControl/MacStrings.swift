/// The words of the native menus, windows and alerts, in the language settings.json pins
/// (`lang`, see PlanStore.lang); English when none is pinned. The web views have their own
/// tables (web/src/i18n), whose Russian these follow.
///
/// One memberwise value per language: a string missing from one of them does not compile.
struct MacStrings {
    // Status item menu
    let editHome: String
    let loadPlan: String
    let revealPlan: String
    let revealLog: String
    let showIsland: String
    let openAtLogin: String
    let openAtLoginApprove: String
    let pairPhone: String
    let aiAccess: String
    let aiAccessLive: String
    let stopAI: String
    let isConnected: (String) -> String
    let reload: String
    let quit: String

    // About House Control
    let about: String
    let website: String
    let privacy: String
    let support: String
    let onX: (String) -> String
    let onGitHub: (String) -> String
    let sourceCode: String

    // Load Floor Plan…
    let choosePlan: String
    let planNotLoaded: String

    // Open at Login
    let moveFirst: String
    let moveFirstText: String
    let loginAddFailed: String
    let loginRemoveFailed: String
    let loginChangeInSettings: String

    // Pair iPhone
    let pairTitle: String
    let copyPairingLink: String
    let resetPairing: String
    let pairHeadline: String
    let pairDetail: String
    let resetQuestion: String
    let resetText: String
    let reset: String
    let cancel: String
    let connected: (String) -> String
    let waitingForPhone: String
    let allowLocalNetwork: String

    // Smart Life sign-in for a paired iPhone
    let smartLifeTitle: (String) -> String
    let smartLifeHeadline: (String) -> String
    let smartLifeDetail: String
    let requestedBy: (String) -> String

    // Main menu
    let edit: String
    let undo: String
    let redo: String
    let cut: String
    let copy: String
    let paste: String
    let selectAll: String
    let window: String
    let close: String
    let minimize: String

    static func of(_ lang: String?) -> MacStrings { lang == "ru" ? .ru : .en }

    static let en = MacStrings(
        editHome: "Edit Home…",
        loadPlan: "Load Floor Plan…",
        revealPlan: "Reveal Plan File",
        revealLog: "Reveal Device Log",
        showIsland: "Show Island",
        openAtLogin: "Open at Login",
        openAtLoginApprove: "Open at Login — Allow in Settings…",
        pairPhone: "Pair iPhone…",
        aiAccess: "AI Access…",
        aiAccessLive: "AI Access — Live",
        stopAI: "Stop AI Access",
        isConnected: { "\($0) is connected" },
        reload: "Reload",
        quit: "Quit House Control",
        about: "About House Control",
        website: "Website",
        privacy: "Privacy Policy",
        support: "Support",
        onX: { "\($0) on X" },
        onGitHub: { "\($0) on GitHub" },
        sourceCode: "Source Code",
        choosePlan: "Choose a floor plan",
        planNotLoaded: "Could not load this floor plan",
        moveFirst: "Move House Control to Applications first",
        moveFirstText: "It is running from the disk image or from a temporary copy of the download, which is gone after a restart. "
            + "Drag House Control into the Applications folder, open it from there, then turn on Open at Login.",
        loginAddFailed: "Could not add House Control to Login Items",
        loginRemoveFailed: "Could not remove House Control from Login Items",
        loginChangeInSettings: "You can change it in System Settings → General → Login Items.",
        pairTitle: "Pair iPhone",
        copyPairingLink: "Copy Pairing Link",
        resetPairing: "Reset Pairing…",
        pairHeadline: "Scan with House Control on your iPhone",
        pairDetail: "On the iPhone open Settings → Pair with Mac. Both devices must be on the same Wi-Fi. "
            + "Your floor plan, device links and connections stay the same on both, whichever one you edit; "
            + "they travel straight between them, encrypted with the key in this code.",
        resetQuestion: "Reset pairing?",
        resetText: "Every iPhone paired so far stops syncing until it scans the new code.",
        reset: "Reset",
        cancel: "Cancel",
        connected: { "Connected: \($0)" },
        waitingForPhone: "Waiting for an iPhone…",
        allowLocalNetwork: "Allow Local Network access for House Control in System Settings → Privacy & Security",
        smartLifeTitle: { "Smart Life Sign-In for \($0)" },
        smartLifeHeadline: { "Scan with the Smart Life app on \($0)" },
        smartLifeDetail: "Switch to Smart Life on the iPhone, tap the scanner on its Home tab and confirm the login. "
            + "Then return to House Control: this window closes once the iPhone is signed in.",
        requestedBy: { "Requested by \($0)" },
        edit: "Edit",
        undo: "Undo",
        redo: "Redo",
        cut: "Cut",
        copy: "Copy",
        paste: "Paste",
        selectAll: "Select All",
        window: "Window",
        close: "Close",
        minimize: "Minimize")

    static let ru = MacStrings(
        editHome: "Изменить дом…",
        loadPlan: "Загрузить план…",
        revealPlan: "Показать файл плана",
        revealLog: "Показать журнал устройств",
        showIsland: "Показывать островок",
        openAtLogin: "Открывать при входе",
        openAtLoginApprove: "Открывать при входе — разрешите в Настройках…",
        pairPhone: "Подключить iPhone…",
        aiAccess: "Доступ для ИИ…",
        aiAccessLive: "Доступ для ИИ — включён",
        stopAI: "Отключить доступ для ИИ",
        isConnected: { "\($0) подключён" },
        reload: "Обновить",
        quit: "Завершить House Control",
        about: "О House Control",
        website: "Сайт",
        privacy: "Конфиденциальность",
        support: "Поддержка",
        onX: { "\($0) в X" },
        onGitHub: { "\($0) на GitHub" },
        sourceCode: "Исходный код",
        choosePlan: "Выберите план дома",
        planNotLoaded: "Не удалось загрузить этот план",
        moveFirst: "Сначала переместите House Control в «Программы»",
        moveFirstText: "Сейчас он открыт с образа диска или из временной копии загрузки, которая пропадёт после перезагрузки. "
            + "Перетащите House Control в папку «Программы», откройте его оттуда и снова включите «Открывать при входе».",
        loginAddFailed: "Не удалось добавить House Control в объекты входа",
        loginRemoveFailed: "Не удалось убрать House Control из объектов входа",
        loginChangeInSettings: "Это можно изменить в Системных настройках → Основные → Объекты входа.",
        pairTitle: "Подключить iPhone",
        copyPairingLink: "Скопировать ссылку",
        resetPairing: "Сбросить подключение…",
        pairHeadline: "Отсканируйте в House Control на iPhone",
        pairDetail: "На iPhone в House Control откройте Settings → Pair with Mac (там он пока по-английски). Оба устройства должны быть в одной сети Wi-Fi. "
            + "План, привязки устройств и подключения будут одинаковыми на обоих, где бы вы их ни меняли; "
            + "они передаются напрямую, зашифрованные ключом из этого кода.",
        resetQuestion: "Сбросить подключение?",
        resetText: "Все подключённые iPhone перестанут синхронизироваться, пока не отсканируют новый код.",
        reset: "Сбросить",
        cancel: "Отменить",
        connected: { "Подключено: \($0)" },
        waitingForPhone: "Жду iPhone…",
        allowLocalNetwork: "Разрешите House Control доступ к локальной сети: Системные настройки → Конфиденциальность и безопасность",
        smartLifeTitle: { "Вход в Smart Life для \($0)" },
        smartLifeHeadline: { "Отсканируйте в приложении Smart Life на \($0)" },
        smartLifeDetail: "Откройте Smart Life на iPhone, нажмите сканер на вкладке «Дом» и подтвердите вход. "
            + "Потом вернитесь в House Control: окно закроется, когда iPhone войдёт.",
        requestedBy: { "Запрос от \($0)" },
        edit: "Правка",
        undo: "Отменить",
        redo: "Повторить",
        cut: "Вырезать",
        copy: "Скопировать",
        paste: "Вставить",
        selectAll: "Выбрать все",
        window: "Окно",
        close: "Закрыть",
        minimize: "Свернуть")
}
