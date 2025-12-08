// =================================
// NOTIFICATIONS VIEW
// =================================

import SwiftUI

struct NotificationsView: View {
    @StateObject private var viewModel = NotificationsViewModel()
    @EnvironmentObject var appState: AppState

    var body: some View {
        List {
            ForEach(viewModel.notifications) { notification in
                NotificationRowView(notification: notification)
                    .onAppear {
                        if !notification.isRead {
                            Task { await viewModel.markAsRead(notification.id) }
                        }
                    }
            }

            if viewModel.hasMore {
                ProgressView()
                    .onAppear {
                        Task { await viewModel.loadMore() }
                    }
            }
        }
        .listStyle(.plain)
        .navigationTitle("Notifications")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Mark all as read") {
                        Task { await viewModel.markAllAsRead() }
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .refreshable {
            await viewModel.refresh()
        }
        .overlay {
            if viewModel.isLoading && viewModel.notifications.isEmpty {
                ProgressView()
            }

            if !viewModel.isLoading && viewModel.notifications.isEmpty {
                ContentUnavailableView {
                    Label("No Notifications", systemImage: "bell.slash")
                } description: {
                    Text("When someone interacts with your posts, you'll see it here")
                }
            }
        }
        .task {
            await viewModel.load()
        }
        .onChange(of: viewModel.unreadCount) { _, count in
            appState.notificationBadgeCount = count
        }
    }
}

// MARK: - Notification Row View

struct NotificationRowView: View {
    let notification: AppNotification

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Icon
            Image(systemName: notification.icon)
                .foregroundColor(iconColor)
                .frame(width: 32, height: 32)
                .background(iconColor.opacity(0.1))
                .clipShape(Circle())

            // Content
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 4) {
                    NavigationLink(destination: ProfileView(user: notification.actor)) {
                        Text(notification.actor.resolvedDisplayName)
                            .fontWeight(.semibold)
                    }
                    .buttonStyle(.plain)

                    Text(notification.message)
                        .foregroundColor(.secondary)
                }
                .font(.subheadline)

                Text(formatDate(notification.createdAt))
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            if !notification.isRead {
                Circle()
                    .fill(Color.accentColor)
                    .frame(width: 8, height: 8)
            }
        }
        .padding(.vertical, 4)
        .background(notification.isRead ? Color.clear : Color.accentColor.opacity(0.05))
    }

    private var iconColor: Color {
        switch notification.type {
        case .like: return .red
        case .follow: return .accentColor
        case .repost: return .green
        case .mention: return .purple
        case .reply: return .blue
        case .groupInvite: return .orange
        }
    }

    private func formatDate(_ date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}

// MARK: - View Model

@MainActor
class NotificationsViewModel: ObservableObject {
    @Published var notifications: [AppNotification] = []
    @Published var isLoading = false
    @Published var hasMore = true
    @Published var unreadCount = 0

    private var cursor: String?

    func load() async {
        isLoading = true

        do {
            let response = try await APIClient.shared.request(
                NotificationListResponse.self,
                path: "/notifications"
            )
            notifications = response.data.items
            cursor = response.data.nextCursor
            hasMore = response.data.hasMore
            unreadCount = response.data.unreadCount
        } catch {
            // Handle error
        }

        isLoading = false
    }

    func loadMore() async {
        guard hasMore, let cursor = cursor else { return }

        do {
            let response = try await APIClient.shared.request(
                NotificationListResponse.self,
                path: "/notifications",
                queryItems: [URLQueryItem(name: "cursor", value: cursor)]
            )
            notifications.append(contentsOf: response.data.items)
            self.cursor = response.data.nextCursor
            hasMore = response.data.hasMore
        } catch {
            // Handle error
        }
    }

    func refresh() async {
        cursor = nil
        await load()
    }

    func markAsRead(_ id: String) async {
        if let index = notifications.firstIndex(where: { $0.id == id }) {
            notifications[index].isRead = true
            unreadCount = max(0, unreadCount - 1)
        }

        struct MarkReadRequest: Codable {
            let notificationIds: [String]
        }

        do {
            try await APIClient.shared.requestVoid(
                path: "/notifications/mark-read",
                method: .post,
                body: MarkReadRequest(notificationIds: [id])
            )
        } catch {
            // Handle error
        }
    }

    func markAllAsRead() async {
        for i in notifications.indices {
            notifications[i].isRead = true
        }
        unreadCount = 0

        struct MarkReadRequest: Codable {
            let all: Bool
        }

        do {
            try await APIClient.shared.requestVoid(
                path: "/notifications/mark-read",
                method: .post,
                body: MarkReadRequest(all: true)
            )
        } catch {
            // Handle error
        }
    }
}

#Preview {
    NavigationStack {
        NotificationsView()
            .environmentObject(AppState.shared)
    }
}
