// =================================
// API ERROR CODES AND TYPES
// =================================

export enum ErrorCode {
  // Generic Errors (1xxx)
  INTERNAL_ERROR = 'E1000',
  VALIDATION_ERROR = 'E1001',
  NOT_FOUND = 'E1002',
  CONFLICT = 'E1003',
  RATE_LIMITED = 'E1004',
  SERVICE_UNAVAILABLE = 'E1005',
  BAD_REQUEST = 'E1006',

  // Auth Errors (2xxx)
  UNAUTHORIZED = 'E2000',
  INVALID_TOKEN = 'E2001',
  TOKEN_EXPIRED = 'E2002',
  INVALID_CREDENTIALS = 'E2003',
  OTP_INVALID = 'E2004',
  OTP_EXPIRED = 'E2005',
  OTP_MAX_ATTEMPTS = 'E2006',
  ACCOUNT_LOCKED = 'E2007',
  ACCOUNT_SUSPENDED = 'E2008',
  ACCOUNT_DELETED = 'E2009',
  SESSION_REVOKED = 'E2010',
  OAUTH_ERROR = 'E2011',
  MAGIC_LINK_INVALID = 'E2012',
  MAGIC_LINK_EXPIRED = 'E2013',
  AGE_REQUIREMENT_NOT_MET = 'E2014',

  // User Errors (3xxx)
  USER_NOT_FOUND = 'E3000',
  USERNAME_TAKEN = 'E3001',
  EMAIL_TAKEN = 'E3002',
  PHONE_TAKEN = 'E3003',
  INVALID_USERNAME = 'E3004',
  CANNOT_FOLLOW_SELF = 'E3005',
  ALREADY_FOLLOWING = 'E3006',
  NOT_FOLLOWING = 'E3007',
  USER_BLOCKED = 'E3008',
  BLOCKED_BY_USER = 'E3009',
  FOLLOW_REQUEST_PENDING = 'E3010',
  PRIVATE_ACCOUNT = 'E3011',

  // Post Errors (4xxx)
  POST_NOT_FOUND = 'E4000',
  POST_TOO_LONG = 'E4001',
  POST_EMPTY = 'E4002',
  EDIT_WINDOW_EXPIRED = 'E4003',
  CANNOT_EDIT_REPOST = 'E4004',
  ALREADY_LIKED = 'E4005',
  NOT_LIKED = 'E4006',
  CANNOT_REPLY_TO_POST = 'E4007',
  POST_VISIBILITY_ERROR = 'E4008',
  PARENT_POST_NOT_FOUND = 'E4009',

  // Group Errors (5xxx)
  GROUP_NOT_FOUND = 'E5000',
  GROUP_SLUG_TAKEN = 'E5001',
  NOT_GROUP_MEMBER = 'E5002',
  ALREADY_GROUP_MEMBER = 'E5003',
  GROUP_IS_PRIVATE = 'E5004',
  GROUP_IS_SECRET = 'E5005',
  INSUFFICIENT_GROUP_PERMISSIONS = 'E5006',
  CANNOT_REMOVE_OWNER = 'E5007',
  MEMBERSHIP_PENDING = 'E5008',
  MEMBERSHIP_BANNED = 'E5009',
  CANNOT_LEAVE_AS_OWNER = 'E5010',
  INVITE_EXPIRED = 'E5011',
  INVITE_NOT_FOUND = 'E5012',

  // Notification Errors (6xxx)
  NOTIFICATION_NOT_FOUND = 'E6000',
  PUSH_TOKEN_INVALID = 'E6001',

  // Media Errors (7xxx)
  MEDIA_NOT_FOUND = 'E7000',
  MEDIA_TOO_LARGE = 'E7001',
  MEDIA_TYPE_NOT_ALLOWED = 'E7002',
  UPLOAD_EXPIRED = 'E7003',
  UPLOAD_FAILED = 'E7004',
  PROCESSING_FAILED = 'E7005',

  // Report/Moderation Errors (8xxx)
  REPORT_NOT_FOUND = 'E8000',
  ALREADY_REPORTED = 'E8001',
  CANNOT_REPORT_SELF = 'E8002',
  REPORT_ALREADY_RESOLVED = 'E8003',

  // Compliance Errors (9xxx)
  EXPORT_IN_PROGRESS = 'E9000',
  EXPORT_NOT_READY = 'E9001',
  DELETION_IN_PROGRESS = 'E9002',
  INVALID_CONFIRMATION = 'E9003',
}

export interface ValidationErrorDetail {
  field: string;
  message: string;
  code: string;
}

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public message: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.INTERNAL_ERROR]: 'An internal error occurred',
  [ErrorCode.VALIDATION_ERROR]: 'Validation failed',
  [ErrorCode.NOT_FOUND]: 'Resource not found',
  [ErrorCode.CONFLICT]: 'Resource conflict',
  [ErrorCode.RATE_LIMITED]: 'Too many requests, please try again later',
  [ErrorCode.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable',
  [ErrorCode.BAD_REQUEST]: 'Bad request',

  [ErrorCode.UNAUTHORIZED]: 'Authentication required',
  [ErrorCode.INVALID_TOKEN]: 'Invalid token',
  [ErrorCode.TOKEN_EXPIRED]: 'Token has expired',
  [ErrorCode.INVALID_CREDENTIALS]: 'Invalid credentials',
  [ErrorCode.OTP_INVALID]: 'Invalid verification code',
  [ErrorCode.OTP_EXPIRED]: 'Verification code has expired',
  [ErrorCode.OTP_MAX_ATTEMPTS]: 'Maximum verification attempts exceeded',
  [ErrorCode.ACCOUNT_LOCKED]: 'Account is temporarily locked',
  [ErrorCode.ACCOUNT_SUSPENDED]: 'Account has been suspended',
  [ErrorCode.ACCOUNT_DELETED]: 'Account has been deleted',
  [ErrorCode.SESSION_REVOKED]: 'Session has been revoked',
  [ErrorCode.OAUTH_ERROR]: 'OAuth authentication failed',
  [ErrorCode.MAGIC_LINK_INVALID]: 'Invalid magic link',
  [ErrorCode.MAGIC_LINK_EXPIRED]: 'Magic link has expired',
  [ErrorCode.AGE_REQUIREMENT_NOT_MET]: 'You must be at least 16 years old to use this service',

  [ErrorCode.USER_NOT_FOUND]: 'User not found',
  [ErrorCode.USERNAME_TAKEN]: 'Username is already taken',
  [ErrorCode.EMAIL_TAKEN]: 'Email is already registered',
  [ErrorCode.PHONE_TAKEN]: 'Phone number is already registered',
  [ErrorCode.INVALID_USERNAME]: 'Invalid username format',
  [ErrorCode.CANNOT_FOLLOW_SELF]: 'You cannot follow yourself',
  [ErrorCode.ALREADY_FOLLOWING]: 'You are already following this user',
  [ErrorCode.NOT_FOLLOWING]: 'You are not following this user',
  [ErrorCode.USER_BLOCKED]: 'You have blocked this user',
  [ErrorCode.BLOCKED_BY_USER]: 'You have been blocked by this user',
  [ErrorCode.FOLLOW_REQUEST_PENDING]: 'Follow request is pending',
  [ErrorCode.PRIVATE_ACCOUNT]: 'This account is private',

  [ErrorCode.POST_NOT_FOUND]: 'Post not found',
  [ErrorCode.POST_TOO_LONG]: 'Post exceeds maximum length',
  [ErrorCode.POST_EMPTY]: 'Post content cannot be empty',
  [ErrorCode.EDIT_WINDOW_EXPIRED]: 'Post can no longer be edited',
  [ErrorCode.CANNOT_EDIT_REPOST]: 'Reposts cannot be edited',
  [ErrorCode.ALREADY_LIKED]: 'You have already liked this post',
  [ErrorCode.NOT_LIKED]: 'You have not liked this post',
  [ErrorCode.CANNOT_REPLY_TO_POST]: 'You cannot reply to this post',
  [ErrorCode.POST_VISIBILITY_ERROR]: 'Invalid post visibility settings',
  [ErrorCode.PARENT_POST_NOT_FOUND]: 'Parent post not found',

  [ErrorCode.GROUP_NOT_FOUND]: 'Group not found',
  [ErrorCode.GROUP_SLUG_TAKEN]: 'Group URL is already taken',
  [ErrorCode.NOT_GROUP_MEMBER]: 'You are not a member of this group',
  [ErrorCode.ALREADY_GROUP_MEMBER]: 'You are already a member of this group',
  [ErrorCode.GROUP_IS_PRIVATE]: 'This group is private',
  [ErrorCode.GROUP_IS_SECRET]: 'This group is secret',
  [ErrorCode.INSUFFICIENT_GROUP_PERMISSIONS]: 'Insufficient permissions for this action',
  [ErrorCode.CANNOT_REMOVE_OWNER]: 'Group owner cannot be removed',
  [ErrorCode.MEMBERSHIP_PENDING]: 'Membership request is pending',
  [ErrorCode.MEMBERSHIP_BANNED]: 'You have been banned from this group',
  [ErrorCode.CANNOT_LEAVE_AS_OWNER]: 'Transfer ownership before leaving the group',
  [ErrorCode.INVITE_EXPIRED]: 'Group invite has expired',
  [ErrorCode.INVITE_NOT_FOUND]: 'Group invite not found',

  [ErrorCode.NOTIFICATION_NOT_FOUND]: 'Notification not found',
  [ErrorCode.PUSH_TOKEN_INVALID]: 'Invalid push notification token',

  [ErrorCode.MEDIA_NOT_FOUND]: 'Media not found',
  [ErrorCode.MEDIA_TOO_LARGE]: 'File size exceeds maximum allowed',
  [ErrorCode.MEDIA_TYPE_NOT_ALLOWED]: 'File type not allowed',
  [ErrorCode.UPLOAD_EXPIRED]: 'Upload URL has expired',
  [ErrorCode.UPLOAD_FAILED]: 'Upload failed',
  [ErrorCode.PROCESSING_FAILED]: 'Media processing failed',

  [ErrorCode.REPORT_NOT_FOUND]: 'Report not found',
  [ErrorCode.ALREADY_REPORTED]: 'You have already reported this content',
  [ErrorCode.CANNOT_REPORT_SELF]: 'You cannot report your own content',
  [ErrorCode.REPORT_ALREADY_RESOLVED]: 'Report has already been resolved',

  [ErrorCode.EXPORT_IN_PROGRESS]: 'Data export is already in progress',
  [ErrorCode.EXPORT_NOT_READY]: 'Data export is not ready for download',
  [ErrorCode.DELETION_IN_PROGRESS]: 'Account deletion is already in progress',
  [ErrorCode.INVALID_CONFIRMATION]: 'Invalid confirmation',
};

export const ERROR_STATUS_CODES: Record<ErrorCode, number> = {
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.BAD_REQUEST]: 400,

  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.INVALID_TOKEN]: 401,
  [ErrorCode.TOKEN_EXPIRED]: 401,
  [ErrorCode.INVALID_CREDENTIALS]: 401,
  [ErrorCode.OTP_INVALID]: 400,
  [ErrorCode.OTP_EXPIRED]: 400,
  [ErrorCode.OTP_MAX_ATTEMPTS]: 429,
  [ErrorCode.ACCOUNT_LOCKED]: 423,
  [ErrorCode.ACCOUNT_SUSPENDED]: 403,
  [ErrorCode.ACCOUNT_DELETED]: 410,
  [ErrorCode.SESSION_REVOKED]: 401,
  [ErrorCode.OAUTH_ERROR]: 400,
  [ErrorCode.MAGIC_LINK_INVALID]: 400,
  [ErrorCode.MAGIC_LINK_EXPIRED]: 400,
  [ErrorCode.AGE_REQUIREMENT_NOT_MET]: 403,

  [ErrorCode.USER_NOT_FOUND]: 404,
  [ErrorCode.USERNAME_TAKEN]: 409,
  [ErrorCode.EMAIL_TAKEN]: 409,
  [ErrorCode.PHONE_TAKEN]: 409,
  [ErrorCode.INVALID_USERNAME]: 400,
  [ErrorCode.CANNOT_FOLLOW_SELF]: 400,
  [ErrorCode.ALREADY_FOLLOWING]: 409,
  [ErrorCode.NOT_FOLLOWING]: 400,
  [ErrorCode.USER_BLOCKED]: 403,
  [ErrorCode.BLOCKED_BY_USER]: 403,
  [ErrorCode.FOLLOW_REQUEST_PENDING]: 409,
  [ErrorCode.PRIVATE_ACCOUNT]: 403,

  [ErrorCode.POST_NOT_FOUND]: 404,
  [ErrorCode.POST_TOO_LONG]: 400,
  [ErrorCode.POST_EMPTY]: 400,
  [ErrorCode.EDIT_WINDOW_EXPIRED]: 400,
  [ErrorCode.CANNOT_EDIT_REPOST]: 400,
  [ErrorCode.ALREADY_LIKED]: 409,
  [ErrorCode.NOT_LIKED]: 400,
  [ErrorCode.CANNOT_REPLY_TO_POST]: 403,
  [ErrorCode.POST_VISIBILITY_ERROR]: 400,
  [ErrorCode.PARENT_POST_NOT_FOUND]: 404,

  [ErrorCode.GROUP_NOT_FOUND]: 404,
  [ErrorCode.GROUP_SLUG_TAKEN]: 409,
  [ErrorCode.NOT_GROUP_MEMBER]: 403,
  [ErrorCode.ALREADY_GROUP_MEMBER]: 409,
  [ErrorCode.GROUP_IS_PRIVATE]: 403,
  [ErrorCode.GROUP_IS_SECRET]: 403,
  [ErrorCode.INSUFFICIENT_GROUP_PERMISSIONS]: 403,
  [ErrorCode.CANNOT_REMOVE_OWNER]: 400,
  [ErrorCode.MEMBERSHIP_PENDING]: 409,
  [ErrorCode.MEMBERSHIP_BANNED]: 403,
  [ErrorCode.CANNOT_LEAVE_AS_OWNER]: 400,
  [ErrorCode.INVITE_EXPIRED]: 400,
  [ErrorCode.INVITE_NOT_FOUND]: 404,

  [ErrorCode.NOTIFICATION_NOT_FOUND]: 404,
  [ErrorCode.PUSH_TOKEN_INVALID]: 400,

  [ErrorCode.MEDIA_NOT_FOUND]: 404,
  [ErrorCode.MEDIA_TOO_LARGE]: 413,
  [ErrorCode.MEDIA_TYPE_NOT_ALLOWED]: 415,
  [ErrorCode.UPLOAD_EXPIRED]: 400,
  [ErrorCode.UPLOAD_FAILED]: 500,
  [ErrorCode.PROCESSING_FAILED]: 500,

  [ErrorCode.REPORT_NOT_FOUND]: 404,
  [ErrorCode.ALREADY_REPORTED]: 409,
  [ErrorCode.CANNOT_REPORT_SELF]: 400,
  [ErrorCode.REPORT_ALREADY_RESOLVED]: 400,

  [ErrorCode.EXPORT_IN_PROGRESS]: 409,
  [ErrorCode.EXPORT_NOT_READY]: 400,
  [ErrorCode.DELETION_IN_PROGRESS]: 409,
  [ErrorCode.INVALID_CONFIRMATION]: 400,
};
