import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT } from '@/constants/theme';

/**
 * Web preview chrome (the Replit device frame) overlays the viewport, so the
 * safe-area context reports zero there. These offsets keep headers clear of it.
 */
const WEB_TOP_CHROME = 67;
const WEB_BOTTOM_CHROME = 34;

/**
 * Safe-area insets adjusted for the web preview frame, plus the padding a
 * scroll view needs to clear the floating tab bar.
 *
 * Use `tabBarPadding` as `contentContainerStyle.paddingBottom` on any screen
 * inside `(tabs)`, and `bottom` for screens with their own sticky action bar.
 */
export function useScreenInsets() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';

  const top = insets.top + (isWeb ? WEB_TOP_CHROME : 0);
  const bottom = insets.bottom + (isWeb ? WEB_BOTTOM_CHROME : 0);

  return {
    top,
    bottom,
    /** Clears the floating tab bar and leaves a comfortable gap below content. */
    tabBarPadding: bottom + TAB_BAR_HEIGHT + 28,
  };
}
