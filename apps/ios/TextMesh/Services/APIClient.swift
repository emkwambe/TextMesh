// =================================
// API CLIENT
// =================================

import Foundation

actor APIClient {
    static let shared = APIClient()

    private let baseURL: URL
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    private init() {
        #if DEBUG
        self.baseURL = URL(string: "http://localhost:3000")!
        #else
        self.baseURL = URL(string: "https://api.textmesh.io/v1")!
        #endif

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        self.session = URLSession(configuration: config)

        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601

        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601
    }

    // MARK: - Request Building

    private func buildRequest(
        path: String,
        method: HTTPMethod,
        body: Encodable? = nil,
        queryItems: [URLQueryItem]? = nil
    ) async throws -> URLRequest {
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: true)!
        components.queryItems = queryItems

        guard let url = components.url else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(UUID().uuidString, forHTTPHeaderField: "X-Request-ID")

        if let token = await TokenStorage.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body = body {
            request.httpBody = try encoder.encode(body)
        }

        return request
    }

    // MARK: - Request Execution

    func request<T: Decodable>(_ type: T.Type, path: String, method: HTTPMethod = .get, body: Encodable? = nil, queryItems: [URLQueryItem]? = nil) async throws -> T {
        let request = try await buildRequest(path: path, method: method, body: body, queryItems: queryItems)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        // Handle token refresh for 401
        if httpResponse.statusCode == 401 {
            if try await refreshToken() {
                return try await self.request(type, path: path, method: method, body: body, queryItems: queryItems)
            } else {
                throw APIError.unauthorized
            }
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            if let errorResponse = try? decoder.decode(ErrorResponse.self, from: data) {
                throw APIError.serverError(code: errorResponse.error.code, message: errorResponse.error.message)
            }
            throw APIError.httpError(statusCode: httpResponse.statusCode)
        }

        return try decoder.decode(type, from: data)
    }

    func requestVoid(path: String, method: HTTPMethod = .get, body: Encodable? = nil) async throws {
        let request = try await buildRequest(path: path, method: method, body: body)
        let (_, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            throw APIError.httpError(statusCode: httpResponse.statusCode)
        }
    }

    // MARK: - Token Refresh

    private func refreshToken() async throws -> Bool {
        guard let refreshToken = await TokenStorage.shared.refreshToken else {
            return false
        }

        struct RefreshRequest: Codable {
            let refreshToken: String
        }

        struct RefreshResponse: Codable {
            let success: Bool
            let data: AuthTokens
        }

        struct AuthTokens: Codable {
            let accessToken: String
            let refreshToken: String
            let expiresIn: Int
        }

        do {
            let response = try await request(
                RefreshResponse.self,
                path: "/auth/refresh",
                method: .post,
                body: RefreshRequest(refreshToken: refreshToken)
            )

            await TokenStorage.shared.saveTokens(
                accessToken: response.data.accessToken,
                refreshToken: response.data.refreshToken
            )
            return true
        } catch {
            await TokenStorage.shared.clearTokens()
            return false
        }
    }
}

// MARK: - HTTP Method

enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case patch = "PATCH"
    case delete = "DELETE"
}

// MARK: - API Error

enum APIError: LocalizedError {
    case invalidURL
    case invalidResponse
    case unauthorized
    case httpError(statusCode: Int)
    case serverError(code: String, message: String)
    case decodingError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .invalidResponse:
            return "Invalid response from server"
        case .unauthorized:
            return "Session expired. Please login again."
        case .httpError(let code):
            return "HTTP error: \(code)"
        case .serverError(_, let message):
            return message
        case .decodingError(let error):
            return "Failed to parse response: \(error.localizedDescription)"
        }
    }
}

// MARK: - Error Response

struct ErrorResponse: Codable {
    let success: Bool
    let error: ErrorDetail
}

struct ErrorDetail: Codable {
    let code: String
    let message: String
}

// MARK: - Token Storage

actor TokenStorage {
    static let shared = TokenStorage()

    private let accessTokenKey = "textmesh_access_token"
    private let refreshTokenKey = "textmesh_refresh_token"

    var accessToken: String? {
        KeychainManager.shared.get(key: accessTokenKey)
    }

    var refreshToken: String? {
        KeychainManager.shared.get(key: refreshTokenKey)
    }

    func saveTokens(accessToken: String, refreshToken: String) {
        KeychainManager.shared.set(key: accessTokenKey, value: accessToken)
        KeychainManager.shared.set(key: refreshTokenKey, value: refreshToken)
    }

    func clearTokens() {
        KeychainManager.shared.delete(key: accessTokenKey)
        KeychainManager.shared.delete(key: refreshTokenKey)
    }
}
