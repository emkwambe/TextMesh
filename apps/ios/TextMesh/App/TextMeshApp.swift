// =================================
// TEXTMESH IOS APP
// =================================

import SwiftUI

@main
struct TextMeshApp: App {
    @StateObject private var authManager = AuthManager.shared
    @StateObject private var appState = AppState.shared

    init() {
        setupAppearance()
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if authManager.isAuthenticated {
                    MainTabView()
                        .environmentObject(authManager)
                        .environmentObject(appState)
                } else {
                    AuthView()
                        .environmentObject(authManager)
                }
            }
            .onAppear {
                authManager.checkAuthState()
            }
        }
    }

    private func setupAppearance() {
        // Navigation bar appearance
        let appearance = UINavigationBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = UIColor.systemBackground
        appearance.titleTextAttributes = [.foregroundColor: UIColor.label]
        appearance.largeTitleTextAttributes = [.foregroundColor: UIColor.label]

        UINavigationBar.appearance().standardAppearance = appearance
        UINavigationBar.appearance().compactAppearance = appearance
        UINavigationBar.appearance().scrollEdgeAppearance = appearance

        // Tab bar appearance
        let tabAppearance = UITabBarAppearance()
        tabAppearance.configureWithOpaqueBackground()
        tabAppearance.backgroundColor = UIColor.systemBackground

        UITabBar.appearance().standardAppearance = tabAppearance
        UITabBar.appearance().scrollEdgeAppearance = tabAppearance
    }
}

// MARK: - App State
class AppState: ObservableObject {
    static let shared = AppState()

    @Published var selectedTab: Tab = .home
    @Published var showingCompose: Bool = false
    @Published var showingSettings: Bool = false
    @Published var notificationBadgeCount: Int = 0

    enum Tab: Int {
        case home = 0
        case search = 1
        case notifications = 2
        case profile = 3
    }

    private init() {}
}
