const { z } = require('zod');
const sanitizeHtml = require('sanitize-html');

// Helper for input sanitization
function sanitizeString(val) {
  if (typeof val !== 'string') return val;
  return sanitizeHtml(val, { allowedTags: [], allowedAttributes: {} }).trim();
}

// ─── Reusable field definitions ───────────────────────────────────────────────
const email = z.string().email('Invalid email address').toLowerCase().trim();
const password = z
  .string()
  .min(6, 'Password must be at least 6 characters')
  .max(128, 'Password too long');

const amount = z.union([
  z.number({ invalid_type_error: 'Amount must be a number' }),
  z.string().transform((v) => {
    const parsed = parseFloat(v);
    if (isNaN(parsed)) throw new Error('Amount must be a valid number');
    return parsed;
  })
]).pipe(
  z.number().positive('Amount must be greater than 0')
);

const dateString = z.string().min(1, 'Date is required');

// ─── Auth schemas ─────────────────────────────────────────────────────────────
const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long').trim().transform(sanitizeString),
  email,
  password,
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: password,
});

// ─── Account schemas ──────────────────────────────────────────────────────────
const accountSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_\-]+$/, 'Invalid account ID format').transform(sanitizeString),
  name: z.string().min(1, 'Name is required').max(100).trim().transform(sanitizeString),
  type: z.enum(['checking', 'savings', 'credit', 'cash']),
  balance: z.union([z.number(), z.string().transform(Number)]).refine((val) => !isNaN(val), {
    message: 'Balance must be a valid number'
  }),
  color: z.string().min(1, 'Color is required').max(50).trim().transform(sanitizeString),
  icon: z.string().min(1, 'Icon is required').max(50).trim().transform(sanitizeString),
  currency: z.string().length(3).default('INR').transform(sanitizeString),
  updatedAt: z.union([z.number(), z.string().transform(Number)]).optional(),
});

// ─── Transaction schemas ──────────────────────────────────────────────────────
const transactionBaseSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_\-]+$/, 'Invalid transaction ID format').transform(sanitizeString),
  accountId: z.string().regex(/^[a-zA-Z0-9_\-]+$/, 'Invalid account ID format').transform(sanitizeString),
  toAccountId: z.string().regex(/^[a-zA-Z0-9_\-]+$/, 'Invalid destination account ID format')
    .nullable()
    .optional()
    .transform((v) => (v ? sanitizeString(v) : v)),
  type: z.enum(['income', 'expense', 'transfer']),
  amount,
  categoryId: z.string().nullable().optional().transform((v) => (v ? sanitizeString(v) : v)),
  note: z.preprocess((val) => {
    if (val === undefined || val === null) return '';
    return typeof val === 'string' ? sanitizeString(val) : String(val);
  }, z.string()).optional(),
  description: z.preprocess((val) => {
    if (val === undefined || val === null) return '';
    return typeof val === 'string' ? sanitizeString(val) : String(val);
  }, z.string()).optional(),
  date: dateString,
  merchant: z.string().nullable().optional().transform((v) => (v ? sanitizeString(v) : v)),
  customCategory: z.string().nullable().optional().transform((v) => (v ? sanitizeString(v) : v)),
  items: z.preprocess((val) => {
    if (val === undefined || val === null) return null;
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  }, z.string().nullable()).optional(),
  updatedAt: z.union([z.number(), z.string().transform(Number)]).optional(),
});

const transactionSchema = transactionBaseSchema.refine((data) => {
  if (data.type && data.type !== 'transfer' && (!data.categoryId || String(data.categoryId).trim() === '')) {
    return false;
  }
  return true;
}, {
  message: 'Category is required for income/expense transactions',
  path: ['categoryId'],
});

const transactionUpdateSchema = transactionBaseSchema.partial().refine((data) => {
  if (data.type && data.type !== 'transfer' && (!data.categoryId || String(data.categoryId).trim() === '')) {
    return false;
  }
  return true;
}, {
  message: 'Category is required for income/expense transactions',
  path: ['categoryId'],
});

// ─── Budget schemas ───────────────────────────────────────────────────────────
const budgetSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_\-]+$/, 'Invalid budget ID format').transform(sanitizeString),
  categoryId: z.string().min(1, 'Category ID is required').max(50).trim().transform(sanitizeString),
  limit: amount,
  period: z.enum(['daily', 'weekly', 'monthly', 'yearly']).default('monthly'),
  updatedAt: z.union([z.number(), z.string().transform(Number)]).optional(),
});

const budgetUpdateSchema = budgetSchema.partial();

// ─── Savings Goal schemas ─────────────────────────────────────────────────────
const savingsGoalSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_\-]+$/, 'Invalid goal ID format').transform(sanitizeString),
  name: z.string().min(1, 'Goal name is required').max(100).trim().transform(sanitizeString),
  targetAmount: amount,
  currentAmount: z.union([z.number(), z.string().transform(Number)]).default(0),
  targetDate: z.string().nullable().optional().transform((v) => (v ? sanitizeString(v) : v)),
  updatedAt: z.union([z.number(), z.string().transform(Number)]).optional(),
});

const savingsGoalUpdateSchema = savingsGoalSchema.partial();

const savingsGoalFundsSchema = z.object({
  amount,
  action: z.enum(['add', 'withdraw']),
});

// ─── User profile schema ──────────────────────────────────────────────────────
const profileUpdateSchema = z.object({
  name: z.string().min(1).max(100).trim().optional().transform((v) => (v ? sanitizeString(v) : v)),
  currency: z.string().length(3).toUpperCase().optional(),
  monthlyIncomeTarget: z.number().min(0).optional().nullable(),
  notificationsEnabled: z.boolean().optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
});

// ─── Recurring Transaction schemas ───────────────────────────────────────────
const recurringTransactionSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_\-]+$/).optional(),
  accountId: z.string().regex(/^[a-zA-Z0-9_\-]+$/),
  type: z.enum(['income', 'expense']),
  amount,
  categoryId: z.string().nullable().optional(),
  note: z.string().max(255).optional().default(''),
  merchant: z.string().nullable().optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  nextDueDate: dateString,
  lastProcessed: z.string().nullable().optional(),
  isActive: z.union([z.number(), z.boolean()]).optional().transform((v) => (v ? 1 : 0)),
  updatedAt: z.union([z.number(), z.string().transform(Number)]).optional(),
});

// ─── Validation middleware factory ────────────────────────────────────────────
function validate(schema) {
  return (req, res, next) => {
    // If route contains id param, but request body doesn't, copy it for schema validate
    if (req.params && req.params.id && !req.body.id) {
      req.body.id = req.params.id;
    }
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'root',
        message: issue.message,
      }));
      return res.status(400).json({
        error: 'Validation failed',
        errors,
        details: errors, // Backwards compatibility for the test suite
      });
    }
    req.validated = result.data;
    req.body = result.data; // Keep req.body synchronized
    next();
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  validate,
  schemas: {
    register: registerSchema,
    login: loginSchema,
    refreshToken: refreshTokenSchema,
    changePassword: changePasswordSchema,
    account: accountSchema,
    transaction: transactionSchema,
    transactionUpdate: transactionUpdateSchema,
    budget: budgetSchema,
    budgetUpdate: budgetUpdateSchema,
    savingsGoal: savingsGoalSchema,
    savingsGoalUpdate: savingsGoalUpdateSchema,
    savingsGoalFunds: savingsGoalFundsSchema,
    profileUpdate: profileUpdateSchema,
    recurringTransaction: recurringTransactionSchema,
  },
};
