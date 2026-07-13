declare module 'react-native-get-sms-android' {
  interface SmsFilter {
    box?: string;
    maxCount?: number;
  }

  interface SmsAndroidStatic {
    list(
      filter: string,
      failCallback: (fail: string) => void,
      successCallback: (count: number, smsList: string) => void
    ): void;
  }

  const SmsAndroid: SmsAndroidStatic;
  export default SmsAndroid;
}