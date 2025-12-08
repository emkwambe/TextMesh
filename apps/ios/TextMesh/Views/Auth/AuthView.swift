// =================================
// AUTH VIEW
// =================================

import SwiftUI
import AuthenticationServices

struct AuthView: View {
    @EnvironmentObject var authManager: AuthManager
    @State private var isLoginMode = true
    @State private var email = ""
    @State private var password = ""
    @State private var username = ""
    @State private var dateOfBirth = Calendar.current.date(byAdding: .year, value: -18, to: Date())!
    @State private var showingOTP = false
    @State private var otpCode = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 32) {
                    // Logo
                    VStack(spacing: 8) {
                        Image(systemName: "bubble.left.and.bubble.right.fill")
                            .font(.system(size: 60))
                            .foregroundColor(.accentColor)

                        Text("TextMesh")
                            .font(.largeTitle.bold())

                        Text("Connect through words")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .padding(.top, 40)

                    // Form
                    VStack(spacing: 16) {
                        if !isLoginMode {
                            TextField("Username", text: $username)
                                .textContentType(.username)
                                .autocapitalization(.none)
                                .textFieldStyle()

                            DatePicker(
                                "Date of Birth",
                                selection: $dateOfBirth,
                                in: ...Calendar.current.date(byAdding: .year, value: -13, to: Date())!,
                                displayedComponents: .date
                            )
                            .datePickerStyle(.compact)
                            .padding()
                            .background(Color(.systemGray6))
                            .cornerRadius(12)
                        }

                        TextField("Email", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .autocapitalization(.none)
                            .textFieldStyle()

                        SecureField("Password", text: $password)
                            .textContentType(isLoginMode ? .password : .newPassword)
                            .textFieldStyle()

                        if let error = authManager.error {
                            Text(error)
                                .font(.caption)
                                .foregroundColor(.red)
                                .multilineTextAlignment(.center)
                        }

                        Button(action: submit) {
                            if authManager.isLoading {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            } else {
                                Text(isLoginMode ? "Sign In" : "Create Account")
                                    .fontWeight(.semibold)
                            }
                        }
                        .buttonStyle(PrimaryButtonStyle())
                        .disabled(authManager.isLoading || !isFormValid)

                        Button(action: { showingOTP = true }) {
                            Text("Sign in with OTP")
                                .font(.subheadline)
                        }
                    }
                    .padding(.horizontal)

                    // Divider
                    HStack {
                        Rectangle()
                            .fill(Color(.systemGray4))
                            .frame(height: 1)
                        Text("or")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Rectangle()
                            .fill(Color(.systemGray4))
                            .frame(height: 1)
                    }
                    .padding(.horizontal)

                    // Social login
                    VStack(spacing: 12) {
                        SignInWithAppleButton(.signIn) { request in
                            request.requestedScopes = [.email, .fullName]
                        } onCompletion: { result in
                            switch result {
                            case .success(let authorization):
                                Task {
                                    await authManager.signInWithApple(authorization: authorization)
                                }
                            case .failure(let error):
                                print("Apple Sign In failed: \(error)")
                            }
                        }
                        .signInWithAppleButtonStyle(.black)
                        .frame(height: 50)
                        .cornerRadius(12)
                    }
                    .padding(.horizontal)

                    // Toggle mode
                    Button(action: { isLoginMode.toggle() }) {
                        HStack {
                            Text(isLoginMode ? "Don't have an account?" : "Already have an account?")
                                .foregroundColor(.secondary)
                            Text(isLoginMode ? "Sign Up" : "Sign In")
                                .fontWeight(.semibold)
                        }
                        .font(.subheadline)
                    }
                }
                .padding(.bottom, 40)
            }
            .sheet(isPresented: $showingOTP) {
                OTPView()
            }
        }
    }

    private var isFormValid: Bool {
        if isLoginMode {
            return !email.isEmpty && !password.isEmpty
        } else {
            return !username.isEmpty && !email.isEmpty && password.count >= 8
        }
    }

    private func submit() {
        Task {
            if isLoginMode {
                await authManager.login(email: email, password: password)
            } else {
                await authManager.register(
                    username: username,
                    email: email,
                    password: password,
                    dateOfBirth: dateOfBirth
                )
            }
        }
    }
}

// MARK: - OTP View

struct OTPView: View {
    @EnvironmentObject var authManager: AuthManager
    @Environment(\.dismiss) var dismiss
    @State private var identifier = ""
    @State private var code = ""
    @State private var codeSent = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                if !codeSent {
                    Text("Enter your email or phone number to receive a one-time code")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)

                    TextField("Email or phone", text: $identifier)
                        .textFieldStyle()

                    Button(action: requestCode) {
                        if authManager.isLoading {
                            ProgressView()
                        } else {
                            Text("Send Code")
                        }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(identifier.isEmpty || authManager.isLoading)
                } else {
                    Text("Enter the 6-digit code sent to \(identifier)")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)

                    TextField("000000", text: $code)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.center)
                        .font(.title)
                        .textFieldStyle()

                    if let error = authManager.error {
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.red)
                    }

                    Button(action: verifyCode) {
                        if authManager.isLoading {
                            ProgressView()
                        } else {
                            Text("Verify")
                        }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(code.count != 6 || authManager.isLoading)

                    Button("Resend code") {
                        requestCode()
                    }
                    .font(.subheadline)
                }

                Spacer()
            }
            .padding()
            .navigationTitle("Sign in with OTP")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func requestCode() {
        Task {
            await authManager.requestOTP(identifier: identifier)
            if authManager.error == nil {
                codeSent = true
            }
        }
    }

    private func verifyCode() {
        Task {
            await authManager.verifyOTP(identifier: identifier, code: code)
            if authManager.isAuthenticated {
                dismiss()
            }
        }
    }
}

// MARK: - Styles

extension View {
    func textFieldStyle() -> some View {
        self
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(maxWidth: .infinity)
            .padding()
            .background(Color.accentColor)
            .foregroundColor(.white)
            .cornerRadius(12)
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

#Preview {
    AuthView()
        .environmentObject(AuthManager.shared)
}
