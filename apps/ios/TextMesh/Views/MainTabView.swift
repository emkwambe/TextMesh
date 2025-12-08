// =================================
// MAIN TAB VIEW
// =================================

import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var authManager: AuthManager
    @State private var showingCompose = false

    var body: some View {
        ZStack(alignment: .bottom) {
            TabView(selection: $appState.selectedTab) {
                NavigationStack {
                    FeedView()
                }
                .tabItem {
                    Label("Home", systemImage: "house")
                }
                .tag(AppState.Tab.home)

                NavigationStack {
                    SearchView()
                }
                .tabItem {
                    Label("Search", systemImage: "magnifyingglass")
                }
                .tag(AppState.Tab.search)

                NavigationStack {
                    NotificationsView()
                }
                .tabItem {
                    Label("Notifications", systemImage: "bell")
                }
                .tag(AppState.Tab.notifications)
                .badge(appState.notificationBadgeCount)

                NavigationStack {
                    if let user = authManager.currentUser {
                        ProfileView(user: user, isCurrentUser: true)
                    }
                }
                .tabItem {
                    Label("Profile", systemImage: "person")
                }
                .tag(AppState.Tab.profile)
            }

            // Floating compose button
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    Button(action: { showingCompose = true }) {
                        Image(systemName: "plus")
                            .font(.title2.bold())
                            .foregroundColor(.white)
                            .frame(width: 56, height: 56)
                            .background(Color.accentColor)
                            .clipShape(Circle())
                            .shadow(radius: 4)
                    }
                    .padding(.trailing, 20)
                    .padding(.bottom, 80)
                }
            }
        }
        .sheet(isPresented: $showingCompose) {
            ComposePostView()
        }
    }
}

#Preview {
    MainTabView()
        .environmentObject(AppState.shared)
        .environmentObject(AuthManager.shared)
}
