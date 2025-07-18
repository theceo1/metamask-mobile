import { StyleSheet } from 'react-native';

const styleSheet = () =>
  StyleSheet.create({
    wrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 32,
      paddingVertical: 4,
    },
    left_section: {
      flexDirection: 'row',
    },
    name_section: {
      flexDirection: 'column',
      marginLeft: 16,
    },
    button_section: {
      flexDirection: 'row',
      justifyContent: 'center',
      width: 50,
    },
    multichain_accounts_row_wrapper: {
      width: '100%',
      marginBottom: 8,
    },
  });

export default styleSheet;
