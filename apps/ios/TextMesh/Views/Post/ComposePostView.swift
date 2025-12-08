// =================================
// COMPOSE POST VIEW
// =================================

import SwiftUI

struct ComposePostView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var authManager: AuthManager
    @StateObject private var viewModel = ComposePostViewModel()
    @FocusState private var isFocused: Bool

    var replyTo: Post?
    var quotedPost: Post?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Reply context
                if let replyTo = replyTo {
                    HStack(spacing: 4) {
                        Text("Replying to")
                            .foregroundColor(.secondary)
                        Text("@\(replyTo.user.username)")
                            .foregroundColor(.accentColor)
                    }
                    .font(.caption)
                    .padding(.horizontal)
                    .padding(.top, 8)
                }

                // Compose area
                HStack(alignment: .top, spacing: 12) {
                    // Avatar
                    if let user = authManager.currentUser {
                        AsyncImage(url: URL(string: user.avatarUrl ?? "")) { image in
                            image.resizable()
                        } placeholder: {
                            Circle()
                                .fill(Color(.systemGray4))
                        }
                        .frame(width: 40, height: 40)
                        .clipShape(Circle())
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        // Text editor
                        TextEditor(text: $viewModel.content)
                            .focused($isFocused)
                            .frame(minHeight: 100)
                            .scrollContentBackground(.hidden)

                        // Quoted post
                        if let quotedPost = quotedPost {
                            QuotedPostView(post: quotedPost)
                        }
                    }
                }
                .padding()

                Spacer()

                Divider()

                // Bottom toolbar
                HStack {
                    // Visibility picker
                    Menu {
                        ForEach(PostVisibility.allCases, id: \.self) { visibility in
                            Button {
                                viewModel.visibility = visibility
                            } label: {
                                Label(visibility.displayName, systemImage: visibility.icon)
                            }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: viewModel.visibility.icon)
                            Text(viewModel.visibility.displayName)
                        }
                        .font(.subheadline)
                        .foregroundColor(.accentColor)
                    }

                    Spacer()

                    // Character count
                    Text("\(500 - viewModel.content.count)")
                        .font(.subheadline)
                        .foregroundColor(viewModel.content.count > 500 ? .red : .secondary)
                }
                .padding()
            }
            .navigationTitle(replyTo != nil ? "Reply" : "New Post")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Post") {
                        Task {
                            await viewModel.createPost(
                                parentId: replyTo?.id,
                                quotedPostId: quotedPost?.id
                            )
                            if viewModel.success {
                                dismiss()
                            }
                        }
                    }
                    .fontWeight(.semibold)
                    .disabled(!viewModel.isValid || viewModel.isLoading)
                }
            }
            .alert("Error", isPresented: .constant(viewModel.error != nil)) {
                Button("OK") {
                    viewModel.error = nil
                }
            } message: {
                if let error = viewModel.error {
                    Text(error)
                }
            }
            .onAppear {
                isFocused = true
            }
        }
    }
}

// MARK: - View Model

@MainActor
class ComposePostViewModel: ObservableObject {
    @Published var content = ""
    @Published var visibility: PostVisibility = .public
    @Published var isLoading = false
    @Published var error: String?
    @Published var success = false

    var isValid: Bool {
        !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        content.count <= 500
    }

    func createPost(parentId: String? = nil, quotedPostId: String? = nil) async {
        isLoading = true
        error = nil

        do {
            let request = CreatePostRequest(
                content: content,
                visibility: visibility,
                parentId: parentId,
                quotedPostId: quotedPostId
            )

            _ = try await APIClient.shared.request(
                PostResponse.self,
                path: "/posts",
                method: .post,
                body: request
            )

            success = true
        } catch let apiError as APIError {
            error = apiError.errorDescription
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }
}

#Preview {
    ComposePostView()
        .environmentObject(AuthManager.shared)
}
