import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import {
  ActivityIndicator,
  Alert,
  View,
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import Text, {
  TextColor,
  TextVariant,
} from '../../../component-library/components/Texts/Text';
import StorageWrapper from '../../../store/storage-wrapper';
import { connect } from 'react-redux';
import { saveOnboardingEvent as saveEvent } from '../../../actions/onboarding';
import {
  passwordSet,
  passwordUnset,
  seedphraseNotBackedUp,
} from '../../../actions/user';
import { setLockTime } from '../../../actions/settings';
import Engine from '../../../core/Engine';
import Device from '../../../util/device';
import {
  passcodeType,
  updateAuthTypeStorageFlags,
} from '../../../util/authentication';
import { strings } from '../../../../locales/i18n';
import { getOnboardingNavbarOptions } from '../../UI/Navbar';
import AppConstants from '../../../core/AppConstants';
import zxcvbn from 'zxcvbn';
import Logger from '../../../util/Logger';
import { ONBOARDING, PREVIOUS_SCREEN } from '../../../constants/navigation';
import {
  EXISTING_USER,
  TRUE,
  SEED_PHRASE_HINTS,
  BIOMETRY_CHOICE_DISABLED,
  PASSCODE_DISABLED,
} from '../../../constants/storage';
import {
  getPasswordStrengthWord,
  passwordRequirementsMet,
  MIN_PASSWORD_LENGTH,
} from '../../../util/password';

import { MetaMetricsEvents } from '../../../core/Analytics';
import { Authentication } from '../../../core';
import AUTHENTICATION_TYPE from '../../../constants/userProperties';
import { ThemeContext, mockTheme } from '../../../util/theme';

import { LoginOptionsSwitch } from '../../UI/LoginOptionsSwitch';
import navigateTermsOfUse from '../../../util/termsOfUse/termsOfUse';
import { ChoosePasswordSelectorsIDs } from '../../../../e2e/selectors/Onboarding/ChoosePassword.selectors';
import trackOnboarding from '../../../util/metrics/TrackOnboarding/trackOnboarding';
import { MetricsEventBuilder } from '../../../core/Analytics/MetricsEventBuilder';
import Icon, {
  IconName,
  IconSize,
} from '../../../component-library/components/Icons/Icon';
import Checkbox from '../../../component-library/components/Checkbox';
import Button, {
  ButtonVariants,
  ButtonWidthTypes,
  ButtonSize,
} from '../../../component-library/components/Buttons/Button';
import TextField from '../../../component-library/components/Form/TextField/TextField';
import Label from '../../../component-library/components/Form/Label';
import { TextFieldSize } from '../../../component-library/components/Form/TextField';
import fox from '../../../animations/Searching_Fox.json';
import LottieView from 'lottie-react-native';

const createStyles = (colors) =>
  StyleSheet.create({
    mainWrapper: {
      backgroundColor: colors.background.default,
      flex: 1,
    },
    wrapper: {
      flex: 1,
      paddingHorizontal: 16,
    },
    container: {
      flex: 1,
      flexDirection: 'column',
    },
    loadingWrapper: {
      paddingHorizontal: 40,
      paddingBottom: 30,
      alignItems: 'center',
      flex: 1,
    },
    foxWrapper: {
      width: Device.isIos() ? 90 : 80,
      height: Device.isIos() ? 90 : 80,
      marginTop: 30,
      marginBottom: 30,
    },
    image: {
      alignSelf: 'center',
      width: 80,
      height: 80,
    },
    title: {
      justifyContent: 'flex-start',
      textAlign: 'flex-start',
      fontSize: 32,
    },
    subtitle: {
      textAlign: 'center',
    },
    field: {
      position: 'relative',
      flexDirection: 'column',
      gap: 8,
    },
    ctaWrapper: {
      width: '100%',
      flexDirection: 'column',
      rowGap: 18,
      marginTop: 'auto',
      marginBottom: Platform.select({
        ios: 16,
        android: 24,
        default: 16,
      }),
    },
    // eslint-disable-next-line react-native/no-unused-styles
    strength_weak: {
      color: colors.error.default,
    },
    // eslint-disable-next-line react-native/no-unused-styles
    strength_good: {
      color: colors.primary.default,
    },
    // eslint-disable-next-line react-native/no-unused-styles
    strength_strong: {
      color: colors.success.default,
    },
    learnMoreContainer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
      gap: 8,
      marginTop: 8,
      marginBottom: 16,
    },
    learnMoreTextContainer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
      gap: 1,
      flexWrap: 'wrap',
      width: '90%',
    },
    headerLeft: {
      marginLeft: 16,
    },
    headerRight: {
      marginRight: 16,
    },
    passwordContainer: {
      flexDirection: 'column',
      rowGap: 16,
      flexGrow: 1,
    },
    label: {
      marginBottom: -4,
    },
    checkbox: {
      alignItems: 'flex-start',
    },
    passwordContainerTitle: {
      flexDirection: 'column',
      rowGap: 4,
    },
  });

const PASSCODE_NOT_SET_ERROR = 'Error: Passcode not set.';

/**
 * View where users can set their password for the first time
 */
class ChoosePassword extends PureComponent {
  static propTypes = {
    /**
     * The navigator object
     */
    navigation: PropTypes.object,
    /**
     * The action to update the password set flag
     * in the redux store
     */
    passwordSet: PropTypes.func,
    /**
     * The action to update the password set flag
     * in the redux store to false
     */
    passwordUnset: PropTypes.func,
    /**
     * The action to update the lock time
     * in the redux store
     */
    setLockTime: PropTypes.func,
    /**
     * Action to reset the flag seedphraseBackedUp in redux
     */
    seedphraseNotBackedUp: PropTypes.func,
    /**
     * Action to save onboarding event
     */
    saveOnboardingEvent: PropTypes.func,
    /**
     * Object that represents the current route info like params passed to it
     */
    route: PropTypes.object,
  };

  state = {
    isSelected: false,
    password: '',
    confirmPassword: '',
    secureTextEntry: true,
    biometryType: null,
    biometryChoice: false,
    rememberMe: false,
    loading: false,
    error: null,
    inputWidth: { width: '99%' },
    showPasswordIndex: [0, 1],
    passwordInputContainerFocusedIndex: -1,
  };

  mounted = true;

  confirmPasswordInput = React.createRef();
  // Flag to know if password in keyring was set or not
  keyringControllerPasswordSet = false;

  track = (event, properties) => {
    const eventBuilder = MetricsEventBuilder.createEventBuilder(event);
    eventBuilder.addProperties(properties);
    trackOnboarding(eventBuilder.build(), this.props.saveOnboardingEvent);
  };

  headerLeft = () => {
    const { navigation } = this.props;
    const colors = this.context.colors || mockTheme.colors;
    const marginLeft = 16;
    return (
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        disabled={this.state.loading}
      >
        <Icon
          name={IconName.ArrowLeft}
          size={IconSize.Lg}
          color={this.state.loading ? colors.icon.muted : colors.icon.default}
          style={{ marginLeft }}
        />
      </TouchableOpacity>
    );
  };

  updateNavBar = () => {
    const { route, navigation } = this.props;
    const colors = this.context.colors || mockTheme.colors;
    navigation.setOptions(
      getOnboardingNavbarOptions(
        route,
        {
          headerLeft: this.headerLeft,
        },
        colors,
        false,
      ),
    );
  };

  termsOfUse = async () => {
    if (this.props.navigation) {
      await navigateTermsOfUse(this.props.navigation.navigate);
    }
  };

  async componentDidMount() {
    const authData = await Authentication.getType();
    const previouslyDisabled = await StorageWrapper.getItem(
      BIOMETRY_CHOICE_DISABLED,
    );
    const passcodePreviouslyDisabled = await StorageWrapper.getItem(
      PASSCODE_DISABLED,
    );
    if (authData.currentAuthType === AUTHENTICATION_TYPE.PASSCODE) {
      this.setState({
        biometryType: passcodeType(authData.currentAuthType),
        biometryChoice: !(
          passcodePreviouslyDisabled && passcodePreviouslyDisabled === TRUE
        ),
      });
    } else if (authData.availableBiometryType) {
      this.setState({
        biometryType: authData.availableBiometryType,
        biometryChoice: !(previouslyDisabled && previouslyDisabled === TRUE),
      });
    }
    this.updateNavBar();
    setTimeout(() => {
      this.setState({
        inputWidth: { width: '100%' },
      });
    }, 100);
    this.termsOfUse();
  }

  componentDidUpdate(prevProps, prevState) {
    this.updateNavBar();
    const prevLoading = prevState.loading;
    const { loading } = this.state;
    const { navigation } = this.props;
    if (!prevLoading && loading) {
      // update navigationOptions
      navigation.setParams({
        headerLeft: () => <View />,
      });
    }
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  setSelection = () => {
    const { isSelected } = this.state;
    this.setState(() => ({ isSelected: !isSelected }));
  };

  onPressCreate = async () => {
    const { loading, isSelected, password, confirmPassword } = this.state;
    const passwordsMatch = password !== '' && password === confirmPassword;
    const canSubmit = passwordsMatch && isSelected;

    if (!canSubmit) return;
    if (loading) return;
    if (!passwordRequirementsMet(password)) {
      this.track(MetaMetricsEvents.WALLET_SETUP_FAILURE, {
        wallet_setup_type: 'import',
        error_type: strings('choose_password.password_length_error'),
      });
      return;
    } else if (password !== confirmPassword) {
      this.track(MetaMetricsEvents.WALLET_SETUP_FAILURE, {
        wallet_setup_type: 'import',
        error_type: strings('choose_password.password_dont_match'),
      });
      return;
    }
    const provider = this.props.route.params?.provider;
    this.track(MetaMetricsEvents.WALLET_CREATION_ATTEMPTED, {
      account_type: provider ? `metamask_${provider}` : 'metamask',
    });

    try {
      this.setState({ loading: true });
      const previous_screen = this.props.route.params?.[PREVIOUS_SCREEN];

      const authType = await Authentication.componentAuthenticationType(
        this.state.biometryChoice,
        this.state.rememberMe,
      );

      if (previous_screen === ONBOARDING) {
        try {
          await Authentication.newWalletAndKeychain(password, authType);
        } catch (error) {
          if (Device.isIos) await this.handleRejectedOsBiometricPrompt();
        }
        this.keyringControllerPasswordSet = true;
        this.props.seedphraseNotBackedUp();
      } else {
        await this.recreateVault(password, authType);
      }

      this.props.passwordSet();
      this.props.setLockTime(AppConstants.DEFAULT_LOCK_TIMEOUT);
      this.setState({ loading: false });
      this.props.navigation.replace('AccountBackupStep1');
      this.track(MetaMetricsEvents.WALLET_CREATED, {
        biometrics_enabled: Boolean(this.state.biometryType),
        password_strength: getPasswordStrengthWord(this.state.passwordStrength),
      });
      this.track(MetaMetricsEvents.WALLET_SETUP_COMPLETED, {
        wallet_setup_type: 'new',
        new_wallet: true,
        account_type: provider ? `metamask_${provider}` : 'metamask',
      });
    } catch (error) {
      try {
        await this.recreateVault('');
      } catch (e) {
        Logger.error(e);
      }
      // Set state in app as it was with no password
      await StorageWrapper.setItem(EXISTING_USER, TRUE);
      await StorageWrapper.removeItem(SEED_PHRASE_HINTS);
      this.props.passwordUnset();
      this.props.setLockTime(-1);
      // Should we force people to enable passcode / biometrics?
      if (error.toString() === PASSCODE_NOT_SET_ERROR) {
        Alert.alert(
          strings('choose_password.security_alert_title'),
          strings('choose_password.security_alert_message'),
        );
        this.setState({ loading: false });
      } else {
        this.setState({ loading: false, error: error.toString() });
      }
      this.track(MetaMetricsEvents.WALLET_SETUP_FAILURE, {
        wallet_setup_type: 'new',
        error_type: error.toString(),
      });
    }
  };

  /**
   * This function handles the case when the user rejects the OS prompt for allowing use of biometrics.
   * If this occurs we will create the wallet automatically with password as the login method
   */
  handleRejectedOsBiometricPrompt = async () => {
    const newAuthData = await Authentication.componentAuthenticationType(
      false,
      false,
    );
    try {
      await Authentication.newWalletAndKeychain(
        this.state.password,
        newAuthData,
      );
    } catch (err) {
      throw Error(strings('choose_password.disable_biometric_error'));
    }
    this.setState({
      biometryType: newAuthData.availableBiometryType,
      biometryChoice: false,
    });
  };

  /**
   * Recreates a vault
   *
   * @param password - Password to recreate and set the vault with
   */
  recreateVault = async (password, authType) => {
    const { KeyringController } = Engine.context;
    const seedPhrase = await this.getSeedPhrase();
    let importedAccounts = [];
    try {
      const keychainPassword = this.keyringControllerPasswordSet
        ? this.state.password
        : '';
      // Get imported accounts
      const simpleKeyrings = KeyringController.state.keyrings.filter(
        (keyring) => keyring.type === 'Simple Key Pair',
      );
      for (let i = 0; i < simpleKeyrings.length; i++) {
        const simpleKeyring = simpleKeyrings[i];
        const simpleKeyringAccounts = await Promise.all(
          simpleKeyring.accounts.map((account) =>
            KeyringController.exportAccount(keychainPassword, account),
          ),
        );
        importedAccounts = [...importedAccounts, ...simpleKeyringAccounts];
      }
    } catch (e) {
      Logger.error(
        e,
        'error while trying to get imported accounts on recreate vault',
      );
    }

    // Recreate keyring with password given to this method
    await Authentication.newWalletAndRestore(
      password,
      authType,
      seedPhrase,
      true,
    );
    // Keyring is set with empty password or not
    this.keyringControllerPasswordSet = password !== '';

    // Get props to restore vault
    const hdKeyring = KeyringController.state.keyrings[0];
    const existingAccountCount = hdKeyring.accounts.length;

    // Create previous accounts again
    for (let i = 0; i < existingAccountCount - 1; i++) {
      await KeyringController.addNewAccount();
    }

    try {
      // Import imported accounts again
      for (let i = 0; i < importedAccounts.length; i++) {
        await KeyringController.importAccountWithStrategy('privateKey', [
          importedAccounts[i],
        ]);
      }
    } catch (e) {
      Logger.error(
        e,
        'error while trying to import accounts on recreate vault',
      );
    }
  };

  /**
   * Returns current vault seed phrase
   * It does it using an empty password or a password set by the user
   * depending on the state the app is currently in
   */
  getSeedPhrase = async () => {
    const { KeyringController } = Engine.context;
    const { password } = this.state;
    const keychainPassword = this.keyringControllerPasswordSet ? password : '';
    return await KeyringController.exportSeedPhrase(keychainPassword);
  };

  jumpToConfirmPassword = () => {
    const { current } = this.confirmPasswordInput;
    current && current.focus();
  };

  updateBiometryChoice = async (biometryChoice) => {
    await updateAuthTypeStorageFlags(biometryChoice);
    this.setState({ biometryChoice });
  };

  renderSwitch = () => {
    const { biometryType, biometryChoice } = this.state;
    const handleUpdateRememberMe = (rememberMe) => {
      this.setState({ rememberMe });
    };
    return (
      <LoginOptionsSwitch
        shouldRenderBiometricOption={biometryType}
        biometryChoiceState={biometryChoice}
        onUpdateBiometryChoice={this.updateBiometryChoice}
        onUpdateRememberMe={handleUpdateRememberMe}
      />
    );
  };

  onPasswordChange = (val) => {
    const passInfo = zxcvbn(val);
    this.setState({
      password: val,
      passwordStrength: passInfo.score,
      confirmPassword: '',
    });
  };

  learnMore = () => {
    const learnMoreUrl =
      'https://support.metamask.io/managing-my-wallet/resetting-deleting-and-restoring/how-can-i-reset-my-password/';
    this.track(MetaMetricsEvents.EXTERNAL_LINK_CLICKED, {
      text: 'Learn More',
      location: 'choose_password',
      url: learnMoreUrl,
    });
    this.props.navigation.push('Webview', {
      screen: 'SimpleWebview',
      params: {
        url: learnMoreUrl,
        title: 'support.metamask.io',
      },
    });
  };

  toggleShowPassword = (index) => {
    this.setState((prevState) => {
      const newShowPasswordIndex = prevState.showPasswordIndex.includes(index)
        ? prevState.showPasswordIndex.filter((i) => i !== index)
        : [...prevState.showPasswordIndex, index];
      return { showPasswordIndex: newShowPasswordIndex };
    });
  };

  setConfirmPassword = (val) => this.setState({ confirmPassword: val });

  checkError = () => {
    const { password, confirmPassword } = this.state;
    return (
      password !== '' && confirmPassword !== '' && password !== confirmPassword
    );
  };

  render() {
    const { isSelected, password, passwordStrength, confirmPassword, loading } =
      this.state;
    const passwordsMatch = password !== '' && password === confirmPassword;
    const canSubmit =
      passwordsMatch && isSelected && password.length >= MIN_PASSWORD_LENGTH;
    const previousScreen = this.props.route.params?.[PREVIOUS_SCREEN];
    const passwordStrengthWord = getPasswordStrengthWord(passwordStrength);
    const colors = this.context.colors || mockTheme.colors;
    const themeAppearance = this.context.themeAppearance || 'light';
    const styles = createStyles(colors);

    return (
      <SafeAreaView style={styles.mainWrapper}>
        {loading ? (
          <View style={styles.loadingWrapper}>
            <View style={styles.foxWrapper}>
              <LottieView
                style={styles.image}
                autoPlay
                loop
                source={fox}
                resizeMode="contain"
              />
            </View>
            <ActivityIndicator size="large" color={colors.text.default} />
            <Text
              variant={TextVariant.HeadingLG}
              style={styles.title}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              {strings(
                previousScreen === ONBOARDING
                  ? 'create_wallet.title'
                  : 'secure_your_wallet.creating_password',
              )}
            </Text>
            <Text
              variant={TextVariant.HeadingSMRegular}
              style={styles.subtitle}
            >
              {strings('create_wallet.subtitle')}
            </Text>
          </View>
        ) : (
          <KeyboardAwareScrollView
            contentContainerStyle={styles.wrapper}
            resetScrollToCoords={{ x: 0, y: 0 }}
          >
            <View style={styles.container}>
              <Text variant={TextVariant.BodyMD} color={TextColor.Alternative}>
                {strings('choose_password.steps', {
                  currentStep: 1,
                  totalSteps: 3,
                })}
              </Text>

              <View
                style={styles.passwordContainer}
                testID={ChoosePasswordSelectorsIDs.CONTAINER_ID}
              >
                <View style={styles.passwordContainerTitle}>
                  <Text
                    variant={TextVariant.DisplayMD}
                    color={TextColor.Default}
                  >
                    {strings('choose_password.title')}
                  </Text>
                  <Text
                    variant={TextVariant.BodySM}
                    color={TextColor.Alternative}
                  >
                    {strings('choose_password.description')}
                  </Text>
                </View>

                <View style={styles.field}>
                  <Label
                    variant={TextVariant.BodyMDMedium}
                    color={TextColor.Default}
                    style={styles.label}
                  >
                    {strings('choose_password.password')}
                  </Label>
                  <TextField
                    placeholder={strings(
                      'import_from_seed.enter_strong_password',
                    )}
                    secureTextEntry={this.state.showPasswordIndex.includes(0)}
                    value={password}
                    onChangeText={this.onPasswordChange}
                    placeholderTextColor={colors.text.muted}
                    testID={ChoosePasswordSelectorsIDs.NEW_PASSWORD_INPUT_ID}
                    onSubmitEditing={this.jumpToConfirmPassword}
                    autoComplete="new-password"
                    returnKeyType="next"
                    autoCapitalize="none"
                    keyboardAppearance={themeAppearance}
                    size={TextFieldSize.Lg}
                    endAccessory={
                      <Icon
                        name={
                          this.state.showPasswordIndex.includes(0)
                            ? IconName.Eye
                            : IconName.EyeSlash
                        }
                        size={IconSize.Lg}
                        color={colors.icon.alternative}
                        onPress={() => this.toggleShowPassword(0)}
                      />
                    }
                  />
                  {Boolean(password) &&
                    password.length < MIN_PASSWORD_LENGTH && (
                      <Text
                        variant={TextVariant.BodySM}
                        color={TextColor.Alternative}
                      >
                        {strings('choose_password.must_be_at_least', {
                          number: MIN_PASSWORD_LENGTH,
                        })}
                      </Text>
                    )}
                  {Boolean(password) &&
                    password.length >= MIN_PASSWORD_LENGTH && (
                      <Text
                        variant={TextVariant.BodySM}
                        color={TextColor.Alternative}
                        testID={ChoosePasswordSelectorsIDs.PASSWORD_STRENGTH_ID}
                      >
                        {strings('choose_password.password_strength')}
                        <Text
                          variant={TextVariant.BodySM}
                          color={TextColor.Alternative}
                          style={styles[`strength_${passwordStrengthWord}`]}
                        >
                          {' '}
                          {strings(
                            `choose_password.strength_${passwordStrengthWord}`,
                          )}
                        </Text>
                      </Text>
                    )}
                </View>

                <View style={styles.field}>
                  <Label
                    variant={TextVariant.BodyMDMedium}
                    color={TextColor.Default}
                    style={styles.label}
                  >
                    {strings('choose_password.confirm_password')}
                  </Label>
                  <TextField
                    placeholder={strings('import_from_seed.re_enter_password')}
                    value={confirmPassword}
                    onChangeText={this.setConfirmPassword}
                    secureTextEntry={this.state.showPasswordIndex.includes(1)}
                    placeholderTextColor={colors.text.muted}
                    testID={
                      ChoosePasswordSelectorsIDs.CONFIRM_PASSWORD_INPUT_ID
                    }
                    accessibilityLabel={
                      ChoosePasswordSelectorsIDs.CONFIRM_PASSWORD_INPUT_ID
                    }
                    autoComplete="new-password"
                    onSubmitEditing={this.onPressCreate}
                    returnKeyType={'done'}
                    autoCapitalize="none"
                    keyboardAppearance={themeAppearance}
                    size={TextFieldSize.Lg}
                    endAccessory={
                      <Icon
                        name={
                          this.state.showPasswordIndex.includes(1)
                            ? IconName.Eye
                            : IconName.EyeSlash
                        }
                        size={IconSize.Lg}
                        color={colors.icon.alternative}
                        onPress={() => this.toggleShowPassword(1)}
                      />
                    }
                    isDisabled={password === ''}
                  />
                  {this.checkError() && (
                    <Text variant={TextVariant.BodySM} color={TextColor.Error}>
                      {strings('choose_password.password_error')}
                    </Text>
                  )}
                </View>

                <View style={styles.learnMoreContainer}>
                  <Checkbox
                    onPress={this.setSelection}
                    isChecked={isSelected}
                    testID={ChoosePasswordSelectorsIDs.I_UNDERSTAND_CHECKBOX_ID}
                    accessibilityLabel={
                      ChoosePasswordSelectorsIDs.I_UNDERSTAND_CHECKBOX_ID
                    }
                    style={styles.checkbox}
                  />
                  <Button
                    variant={ButtonVariants.Link}
                    onPress={this.setSelection}
                    style={styles.learnMoreTextContainer}
                    testID={ChoosePasswordSelectorsIDs.CHECKBOX_TEXT_ID}
                    label={
                      <Text
                        variant={TextVariant.BodyMD}
                        color={TextColor.Default}
                      >
                        {strings('import_from_seed.learn_more')}
                        <Text
                          variant={TextVariant.BodyMD}
                          color={TextColor.Primary}
                          onPress={this.learnMore}
                          testID={ChoosePasswordSelectorsIDs.LEARN_MORE_LINK_ID}
                        >
                          {' ' + strings('reset_password.learn_more')}
                        </Text>
                      </Text>
                    }
                  />
                </View>

                <View style={styles.ctaWrapper}>
                  {this.renderSwitch()}
                  <Button
                    variant={ButtonVariants.Primary}
                    onPress={this.onPressCreate}
                    label={strings('choose_password.create_password_cta')}
                    disabled={!canSubmit}
                    width={ButtonWidthTypes.Full}
                    size={ButtonSize.Lg}
                    isDisabled={!canSubmit}
                    testID={ChoosePasswordSelectorsIDs.SUBMIT_BUTTON_ID}
                  />
                </View>
              </View>
            </View>
          </KeyboardAwareScrollView>
        )}
      </SafeAreaView>
    );
  }
}

ChoosePassword.contextType = ThemeContext;

const mapDispatchToProps = (dispatch) => ({
  passwordSet: () => dispatch(passwordSet()),
  passwordUnset: () => dispatch(passwordUnset()),
  setLockTime: (time) => dispatch(setLockTime(time)),
  seedphraseNotBackedUp: () => dispatch(seedphraseNotBackedUp()),
  saveOnboardingEvent: (...eventArgs) => dispatch(saveEvent(eventArgs)),
});

const mapStateToProps = (state) => ({});

export default connect(mapStateToProps, mapDispatchToProps)(ChoosePassword);
