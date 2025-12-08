// =================================
// SETTINGS VIEW
// =================================

import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var authManager: AuthManager
    @Environment(\.dismiss) var dismiss
    @State private var showingLogoutAlert = false
    @State private var showingDeleteAccountAlert = false

    var body: some View {
        NavigationStack {
            List {
                // Account
                Section("Account") {
                    NavigationLink(destination: AccountSettingsView()) {
                        Label("Account Settings", systemImage: "person.circle")
                    }

                    NavigationLink(destination: PrivacySettingsView()) {
                        Label("Privacy", systemImage: "lock")
                    }

                    NavigationLink(destination: NotificationSettingsView()) {
                        Label("Notifications", systemImage: "bell")
                    }
                }

                // Preferences
                Section("Preferences") {
                    NavigationLink(destination: AppearanceSettingsView()) {
                        Label("Appearance", systemImage: "paintbrush")
                    }

                    NavigationLink(destination: BlockedUsersView()) {
                        Label("Blocked Users", systemImage: "nosign")
                    }

                    NavigationLink(destination: MutedUsersView()) {
                        Label("Muted Users", systemImage: "speaker.slash")
                    }
                }

                // Support
                Section("Support") {
                    Link(destination: URL(string: "https://textmesh.io/help")!) {
                        Label("Help Center", systemImage: "questionmark.circle")
                    }

                    Link(destination: URL(string: "https://textmesh.io/privacy")!) {
                        Label("Privacy Policy", systemImage: "doc.text")
                    }

                    Link(destination: URL(string: "https://textmesh.io/terms")!) {
                        Label("Terms of Service", systemImage: "doc.text")
                    }
                }

                // About
                Section("About") {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0")
                            .foregroundColor(.secondary)
                    }
                }

                // Logout
                Section {
                    Button(role: .destructive) {
                        showingLogoutAlert = true
                    } label: {
                        Label("Log Out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }

                // Danger zone
                Section {
                    Button(role: .destructive) {
                        showingDeleteAccountAlert = true
                    } label: {
                        Label("Delete Account", systemImage: "trash")
                    }
                } footer: {
                    Text("Permanently delete your account and all associated data. This action cannot be undone.")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .alert("Log Out", isPresented: $showingLogoutAlert) {
                Button("Cancel", role: .cancel) {}
                Button("Log Out", role: .destructive) {
                    Task {
                        await authManager.logout()
                        dismiss()
                    }
                }
            } message: {
                Text("Are you sure you want to log out?")
            }
            .alert("Delete Account", isPresented: $showingDeleteAccountAlert) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    // Handle account deletion
                }
            } message: {
                Text("Are you sure you want to permanently delete your account? This action cannot be undone.")
            }
        }
    }
}

// MARK: - Placeholder Views

struct AccountSettingsView: View {
    @EnvironmentObject var authManager: AuthManager

    var body: some View {
        List {
            if let user = authManager.currentUser {
                Section("Profile") {
                    HStack {
                        Text("Username")
                        Spacer()
                        Text("@\(user.username)")
                            .foregroundColor(.secondary)
                    }
                }

                Section {
                    NavigationLink("Change Password") {
                        ChangePasswordView()
                    }

                    NavigationLink("Email Settings") {
                        EmailSettingsView()
                    }
                }
            }
        }
        .navigationTitle("Account")
    }
}

struct PrivacySettingsView: View {
    @AppStorage("defaultVisibility") private var defaultVisibility = "PUBLIC"
    @AppStorage("allowMessages") private var allowMessages = true
    @AppStorage("showActivity") private var showActivity = true

    var body: some View {
        List {
            Section("Default Post Visibility") {
                Picker("Visibility", selection: $defaultVisibility) {
                    Text("Everyone").tag("PUBLIC")
                    Text("Followers").tag("FOLLOWERS")
                    Text("Only Me").tag("PRIVATE")
                }
                .pickerStyle(.segmented)
            }

            Section("Interactions") {
                Toggle("Allow Direct Messages", isOn: $allowMessages)
                Toggle("Show Activity Status", isOn: $showActivity)
            }

            Section {
                NavigationLink("Data Download") {
                    DataDownloadView()
                }
            } footer: {
                Text("Download a copy of your data")
            }
        }
        .navigationTitle("Privacy")
    }
}

struct NotificationSettingsView: View {
    @AppStorage("pushEnabled") private var pushEnabled = true
    @AppStorage("notifyLikes") private var notifyLikes = true
    @AppStorage("notifyReplies") private var notifyReplies = true
    @AppStorage("notifyFollows") private var notifyFollows = true
    @AppStorage("notifyMentions") private var notifyMentions = true

    var body: some View {
        List {
            Section {
                Toggle("Push Notifications", isOn: $pushEnabled)
            }

            Section("Notify me about") {
                Toggle("Likes", isOn: $notifyLikes)
                Toggle("Replies", isOn: $notifyReplies)
                Toggle("New Followers", isOn: $notifyFollows)
                Toggle("Mentions", isOn: $notifyMentions)
            }
            .disabled(!pushEnabled)
        }
        .navigationTitle("Notifications")
    }
}

struct AppearanceSettingsView: View {
    @AppStorage("colorScheme") private var colorScheme = "system"
    @AppStorage("fontSize") private var fontSize = 1.0

    var body: some View {
        List {
            Section("Theme") {
                Picker("Appearance", selection: $colorScheme) {
                    Text("System").tag("system")
                    Text("Light").tag("light")
                    Text("Dark").tag("dark")
                }
                .pickerStyle(.segmented)
            }

            Section("Text Size") {
                Slider(value: $fontSize, in: 0.8...1.4, step: 0.1)
                Text("Sample text at current size")
                    .font(.system(size: 16 * fontSize))
            }
        }
        .navigationTitle("Appearance")
    }
}

struct BlockedUsersView: View {
    var body: some View {
        ContentUnavailableView {
            Label("No Blocked Users", systemImage: "nosign")
        } description: {
            Text("Users you block won't be able to see your posts or message you")
        }
        .navigationTitle("Blocked Users")
    }
}

struct MutedUsersView: View {
    var body: some View {
        ContentUnavailableView {
            Label("No Muted Users", systemImage: "speaker.slash")
        } description: {
            Text("Muted users' posts won't appear in your feed")
        }
        .navigationTitle("Muted Users")
    }
}

struct ChangePasswordView: View {
    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""

    var body: some View {
        Form {
            SecureField("Current Password", text: $currentPassword)
            SecureField("New Password", text: $newPassword)
            SecureField("Confirm Password", text: $confirmPassword)

            Button("Update Password") {
                // Handle password change
            }
            .disabled(newPassword.isEmpty || newPassword != confirmPassword)
        }
        .navigationTitle("Change Password")
    }
}

struct EmailSettingsView: View {
    var body: some View {
        Text("Email Settings")
            .navigationTitle("Email")
    }
}

struct DataDownloadView: View {
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "arrow.down.doc")
                .font(.system(size: 60))
                .foregroundColor(.accentColor)

            Text("Download Your Data")
                .font(.title2.bold())

            Text("Request a copy of all your data including posts, profile information, and activity.")
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)

            Button("Request Download") {
                // Handle data download request
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
        .navigationTitle("Data Download")
    }
}

struct EditProfileView: View {
    let user: User
    @Environment(\.dismiss) var dismiss
    @State private var displayName: String
    @State private var bio: String
    @State private var isLoading = false

    init(user: User) {
        self.user = user
        _displayName = State(initialValue: user.displayName ?? "")
        _bio = State(initialValue: user.bio ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Display Name", text: $displayName)
                    TextField("Bio", text: $bio, axis: .vertical)
                        .lineLimit(3...6)
                }
            }
            .navigationTitle("Edit Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task { await save() }
                    }
                    .disabled(isLoading)
                }
            }
        }
    }

    private func save() async {
        isLoading = true

        do {
            let request = UpdateProfileRequest(
                displayName: displayName,
                bio: bio
            )

            try await APIClient.shared.requestVoid(
                path: "/users/me",
                method: .patch,
                body: request
            )

            dismiss()
        } catch {
            // Handle error
        }

        isLoading = false
    }
}

#Preview {
    SettingsView()
        .environmentObject(AuthManager.shared)
}
