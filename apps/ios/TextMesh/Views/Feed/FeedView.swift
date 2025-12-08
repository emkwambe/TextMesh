// =================================
// FEED VIEW
// =================================

import SwiftUI

struct FeedView: View {
    @StateObject private var viewModel = FeedViewModel()
    @State private var selectedFeed: FeedType = .home

    var body: some View {
        VStack(spacing: 0) {
            // Feed selector
            Picker("Feed", selection: $selectedFeed) {
                ForEach(FeedType.allCases, id: \.self) { type in
                    Text(type.title).tag(type)
                }
            }
            .pickerStyle(.segmented)
            .padding()

            // Posts list
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(viewModel.posts) { post in
                        NavigationLink(destination: PostDetailView(post: post)) {
                            PostRowView(post: post)
                        }
                        .buttonStyle(.plain)

                        Divider()
                    }

                    if viewModel.hasMore && !viewModel.posts.isEmpty {
                        ProgressView()
                            .padding()
                            .onAppear {
                                Task {
                                    await viewModel.loadMore(type: selectedFeed)
                                }
                            }
                    }
                }
            }
            .refreshable {
                await viewModel.refresh(type: selectedFeed)
            }
        }
        .navigationTitle("TextMesh")
        .navigationBarTitleDisplayMode(.inline)
        .overlay {
            if viewModel.isLoading && viewModel.posts.isEmpty {
                ProgressView()
            }

            if let error = viewModel.error {
                ContentUnavailableView {
                    Label("Error", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(error)
                } actions: {
                    Button("Retry") {
                        Task { await viewModel.loadFeed(type: selectedFeed) }
                    }
                }
            }

            if !viewModel.isLoading && viewModel.posts.isEmpty && viewModel.error == nil {
                ContentUnavailableView {
                    Label("No Posts", systemImage: "text.bubble")
                } description: {
                    Text(selectedFeed == .home
                        ? "Follow people to see their posts here"
                        : "Discover trending posts"
                    )
                }
            }
        }
        .task {
            await viewModel.loadFeed(type: selectedFeed)
        }
        .onChange(of: selectedFeed) { _, newValue in
            Task { await viewModel.loadFeed(type: newValue) }
        }
    }
}

// MARK: - Feed Type

enum FeedType: CaseIterable {
    case home
    case discover

    var title: String {
        switch self {
        case .home: return "Following"
        case .discover: return "Discover"
        }
    }

    var endpoint: String {
        switch self {
        case .home: return "/feed/home"
        case .discover: return "/feed/discover"
        }
    }
}

// MARK: - View Model

@MainActor
class FeedViewModel: ObservableObject {
    @Published var posts: [Post] = []
    @Published var isLoading = false
    @Published var error: String?
    @Published var hasMore = true

    private var cursor: String?

    func loadFeed(type: FeedType) async {
        isLoading = true
        error = nil
        cursor = nil

        do {
            let response = try await APIClient.shared.request(
                PostListResponse.self,
                path: type.endpoint
            )
            posts = response.data.items
            cursor = response.data.nextCursor
            hasMore = response.data.hasMore
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    func loadMore(type: FeedType) async {
        guard hasMore, let cursor = cursor else { return }

        do {
            let response = try await APIClient.shared.request(
                PostListResponse.self,
                path: type.endpoint,
                queryItems: [URLQueryItem(name: "cursor", value: cursor)]
            )
            posts.append(contentsOf: response.data.items)
            self.cursor = response.data.nextCursor
            hasMore = response.data.hasMore
        } catch {
            // Ignore pagination errors
        }
    }

    func refresh(type: FeedType) async {
        await loadFeed(type: type)
    }
}

#Preview {
    NavigationStack {
        FeedView()
    }
}
