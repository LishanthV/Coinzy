export type RootStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  SignUp: undefined;
  Main: undefined;
  TxnDetail: { id: string };
  AddTransaction: { editId?: string } | undefined;
  Export: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  History: undefined;
  Statistics: undefined;
  Budgets: undefined;
  Settings: undefined;
};
