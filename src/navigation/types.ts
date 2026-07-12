export type RootStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  SignUp: undefined;
  OTPVerification: { email: string; name: string };
  Main: undefined;
  TxnDetail: { id: string };
  AddTransaction: { editId?: string } | undefined;
  Export: undefined;
  Recurring: undefined;
  PinSetup: undefined;
  SavingsGoals: undefined;
  AddGoal: { editId?: string } | undefined;
  SpendingForecast: undefined;
  LoanPlanner: undefined;
  UPISync: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  History: undefined;
  Statistics: undefined;
  Budgets: undefined;
  Recurring: undefined;
  Settings: undefined;
};