// =================================
// AUTH MANAGER
// =================================

import Foundation
import AuthenticationServices

@MainActor
class AuthManager: ObservableObject {
    static let shared = AuthManager()

    @Published var isAuthenticated = false
    @Published var currentUser: User?
    @Published var isLoading = false
    @Published var error: String?

    private init() {}

    // MARK: - Auth State

    func checkAuthState() {
        Task {
            if await TokenStorage.shared.accessToken != nil {
                await fetchCurrentUser()
            }
        }
    }

    private func fetchCurrentUser() async {
        do {
            let response = try await APIClient.shared.request(UserResponse.self, path: "/users/me")
            currentUser = response.data
            isAuthenticated = true
        } catch {
            await TokenStorage.shared.clearTokens()
            isAuthenticated = false
        }
    }

    // MARK: - Login

    func login(email: String, password: String) async {
        isLoading = true
        error = nil

        do {
            struct LoginRequest: Codable {
                let email: String
                let password: String
            }

            let response = try await APIClient.shared.request(
                AuthResponse.self,
                path: "/auth/login",
                method: .post,
                body: LoginRequest(email: email, password: password)
            )

            await TokenStorage.shared.saveTokens(
                accessToken: response.data.accessToken,
                refreshToken: response.data.refreshToken
            )
            currentUser = response.data.user
            isAuthenticated = true
        } catch let apiError as APIError {
            error = apiError.errorDescription
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Register

    func register(username: String, email: String, password: String, dateOfBirth: Date) async {
        isLoading = true
        error = nil

        do {
            struct RegisterRequest: Codable {
                let username: String
                let email: String
                let password: String
                let dateOfBirth: String
            }

            let dateFormatter = DateFormatter()
            dateFormatter.dateFormat = "yyyy-MM-dd"

            let response = try await APIClient.shared.request(
                AuthResponse.self,
                path: "/auth/register",
                method: .post,
                body: RegisterRequest(
                    username: username,
                    email: email,
                    password: password,
                    dateOfBirth: dateFormatter.string(from: dateOfBirth)
                )
            )

            await TokenStorage.shared.saveTokens(
                accessToken: response.data.accessToken,
                refreshToken: response.data.refreshToken
            )
            currentUser = response.data.user
            isAuthenticated = true
        } catch let apiError as APIError {
            error = apiError.errorDescription
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - OTP

    func requestOTP(identifier: String, type: OTPType = .email) async {
        isLoading = true
        error = nil

        do {
            struct OTPRequest: Codable {
                let identifier: String
                let type: String
            }

            try await APIClient.shared.requestVoid(
                path: "/auth/otp/request",
                method: .post,
                body: OTPRequest(identifier: identifier, type: type.rawValue)
            )
        } catch let apiError as APIError {
            error = apiError.errorDescription
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    func verifyOTP(identifier: String, code: String) async {
        isLoading = true
        error = nil

        do {
            struct VerifyRequest: Codable {
                let identifier: String
                let code: String
            }

            let response = try await APIClient.shared.request(
                AuthResponse.self,
                path: "/auth/otp/verify",
                method: .post,
                body: VerifyRequest(identifier: identifier, code: code)
            )

            await TokenStorage.shared.saveTokens(
                accessToken: response.data.accessToken,
                refreshToken: response.data.refreshToken
            )
            currentUser = response.data.user
            isAuthenticated = true
        } catch let apiError as APIError {
            error = apiError.errorDescription
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Apple Sign In

    func signInWithApple(authorization: ASAuthorization) async {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let identityToken = credential.identityToken,
              let identityTokenString = String(data: identityToken, encoding: .utf8),
              let authorizationCode = credential.authorizationCode,
              let authorizationCodeString = String(data: authorizationCode, encoding: .utf8)
        else {
            error = "Failed to get Apple credentials"
            return
        }

        isLoading = true
        error = nil

        do {
            struct AppleSignInRequest: Codable {
                let identityToken: String
                let authorizationCode: String
                let user: AppleUser?
            }

            struct AppleUser: Codable {
                let email: String?
                let firstName: String?
                let lastName: String?
            }

            var appleUser: AppleUser?
            if let email = credential.email {
                appleUser = AppleUser(
                    email: email,
                    firstName: credential.fullName?.givenName,
                    lastName: credential.fullName?.familyName
                )
            }

            let response = try await APIClient.shared.request(
                AuthResponse.self,
                path: "/auth/oauth/apple",
                method: .post,
                body: AppleSignInRequest(
                    identityToken: identityTokenString,
                    authorizationCode: authorizationCodeString,
                    user: appleUser
                )
            )

            await TokenStorage.shared.saveTokens(
                accessToken: response.data.accessToken,
                refreshToken: response.data.refreshToken
            )
            currentUser = response.data.user
            isAuthenticated = true
        } catch let apiError as APIError {
            error = apiError.errorDescription
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Logout

    func logout() async {
        do {
            try await APIClient.shared.requestVoid(path: "/auth/logout", method: .post)
        } catch {
            // Ignore logout errors
        }

        await TokenStorage.shared.clearTokens()
        currentUser = nil
        isAuthenticated = false
    }
}

// MARK: - Supporting Types

struct AuthResponse: Codable {
    let success: Bool
    let data: AuthData
}

struct AuthData: Codable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int
    let user: User
}

enum OTPType: String {
    case email = "EMAIL"
    case sms = "SMS"
}
