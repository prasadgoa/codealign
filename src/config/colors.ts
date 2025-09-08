// Configuration for app colors and theming
export interface ColorConfig {
  // Logo and Branding Colors
  logo: {
    primary: string;        // Main logo background gradient start
    primaryEnd: string;     // Main logo background gradient end
    secondary: string;      // Shield/badge background gradient start
    secondaryEnd: string;   // Shield/badge background gradient end
    icon: string;          // Icon color inside logo
  };
  
  // Navigation and Header Colors
  navigation: {
    background: string;     // Header background
    border: string;        // Header border
    titleText: string;     // App title color
    taglineText: string;   // Tagline color
    companyText: string;   // Company name color
    linkInactive: string;  // Inactive nav links
    linkActive: string;    // Active/hover nav links
    activeBorder: string;  // Active tab border
  };
  
  // Status Badge Colors
  statusBadges: {
    active: {
      background: string;   // Active document badge background
      text: string;        // Active document badge text
      hover: string;       // Active badge hover state
    };
    archived: {
      background: string;  // Archived document badge background
      text: string;        // Archived document badge text
      hover: string;       // Archived badge hover state
    };
  };
  
  // Section-specific Colors
  sections: {
    comingSoon: {
      background: string;   // Coming soon section background
      border: string;       // Coming soon section border
      titleText: string;    // Coming soon title
      bodyText: string;     // Coming soon description
    };
    error: {
      background: string;   // Error message background
      border: string;       // Error message border
      titleText: string;    // Error title text
      bodyText: string;     // Error body text
    };
  };
  
  // Footer Colors
  footer: {
    background: string;     // Footer background
    border: string;        // Footer border
    text: string;          // Footer text
    companyHighlight: string; // Company name highlight
  };
}

// Fire Department Theme (Option 3: Premium Fire Department)
export const fireTheme: ColorConfig = {
  logo: {
    primary: "rgb(153, 27, 27)",        // Rich Crimson Red - PRIMARY
    primaryEnd: "rgb(127, 29, 29)",     // Gradient end - PRIMARY darker
    secondary: "rgb(245, 158, 11)",     // Antique Gold - SECONDARY
    secondaryEnd: "rgb(217, 119, 6)",   // Gold gradient end - SECONDARY darker
    icon: "rgb(255, 255, 255)",         // NEUTRAL BASE
  },
  
  navigation: {
    background: "rgb(255, 255, 255)",   // NEUTRAL BASE
    border: "rgb(229, 231, 235)",       // NEUTRAL SYSTEM
    titleText: "rgb(17, 24, 39)",       // NEUTRAL SYSTEM
    taglineText: "rgb(75, 85, 99)",     // NEUTRAL SYSTEM
    companyText: "rgb(153, 27, 27)",    // PRIMARY
    linkInactive: "rgb(55, 65, 81)",    // NEUTRAL SYSTEM
    linkActive: "rgb(153, 27, 27)",     // PRIMARY
    activeBorder: "rgb(153, 27, 27)",   // PRIMARY
  },
  
  statusBadges: {
    active: {
      background: "rgb(153, 27, 27)",    // PRIMARY burgundy - matches logo
      text: "rgb(255, 255, 255)",        // white
      hover: "rgb(127, 29, 29)",         // Darker burgundy for hover
    },
    archived: {
      background: "hsl(214, 40%, 94%)",  // Current CSS variable secondary
      text: "hsl(222, 47%, 11%)",        // Current CSS variable foreground
      hover: "hsl(214, 40%, 88%)",       // Slightly darker
    },
  },
  
  sections: {
    comingSoon: {
      background: "rgb(240, 253, 244)",  // green-50
      border: "rgb(187, 247, 208)",      // green-200
      titleText: "rgb(14, 116, 144)",    // green-900
      bodyText: "rgb(21, 128, 61)",      // green-700
    },
    error: {
      background: "rgb(254, 242, 242)",  // red-50
      border: "rgb(254, 202, 202)",      // red-200
      titleText: "rgb(127, 29, 29)",     // Darker crimson for authority
      bodyText: "rgb(153, 27, 27)",      // PRIMARY (updated to match theme)
    },
  },
  
  footer: {
    background: "rgb(255, 255, 255)",   // NEUTRAL BASE
    border: "rgb(229, 231, 235)",       // NEUTRAL SYSTEM
    text: "rgb(75, 85, 99)",            // NEUTRAL SYSTEM
    companyHighlight: "rgb(153, 27, 27)", // PRIMARY
  },
};

// Police Theme (Alternative)
export const policeTheme: ColorConfig = {
  logo: {
    primary: "rgb(30, 58, 138)",        // blue-800
    primaryEnd: "rgb(30, 41, 59)",      // slate-800
    secondary: "rgb(234, 179, 8)",      // yellow-500
    secondaryEnd: "rgb(202, 138, 4)",   // yellow-600
    icon: "rgb(255, 255, 255)",         // white
  },
  
  navigation: {
    background: "rgb(255, 255, 255)",   // white
    border: "rgb(229, 231, 235)",       // gray-200
    titleText: "rgb(17, 24, 39)",       // gray-900
    taglineText: "rgb(75, 85, 99)",     // gray-600
    companyText: "rgb(30, 58, 138)",    // blue-800
    linkInactive: "rgb(55, 65, 81)",    // gray-700
    linkActive: "rgb(37, 99, 235)",     // blue-600
    activeBorder: "rgb(37, 99, 235)",   // blue-600
  },
  
  statusBadges: {
    active: {
      background: "rgb(37, 99, 235)",    // blue-600
      text: "rgb(255, 255, 255)",        // white
      hover: "rgb(29, 78, 216)",         // blue-700
    },
    archived: {
      background: "rgb(241, 245, 249)",  // slate-100
      text: "rgb(51, 65, 85)",           // slate-700
      hover: "rgb(226, 232, 240)",       // slate-200
    },
  },
  
  sections: {
    comingSoon: {
      background: "rgb(239, 246, 255)",  // blue-50
      border: "rgb(191, 219, 254)",      // blue-200
      titleText: "rgb(30, 58, 138)",     // blue-800
      bodyText: "rgb(37, 99, 235)",      // blue-600
    },
    error: {
      background: "rgb(254, 242, 242)",  // red-50
      border: "rgb(254, 202, 202)",      // red-200
      titleText: "rgb(153, 27, 27)",     // red-800
      bodyText: "rgb(185, 28, 28)",      // red-700
    },
  },
  
  footer: {
    background: "rgb(255, 255, 255)",   // white
    border: "rgb(229, 231, 235)",       // gray-200
    text: "rgb(75, 85, 99)",            // gray-600
    companyHighlight: "rgb(37, 99, 235)", // blue-600
  },
};

// Medical/EMS Theme (Alternative)
export const medicalTheme: ColorConfig = {
  logo: {
    primary: "rgb(220, 38, 38)",        // red-600
    primaryEnd: "rgb(185, 28, 28)",     // red-700
    secondary: "rgb(255, 255, 255)",    // white
    secondaryEnd: "rgb(243, 244, 246)",  // gray-100
    icon: "rgb(255, 255, 255)",         // white
  },
  
  navigation: {
    background: "rgb(255, 255, 255)",   // white
    border: "rgb(229, 231, 235)",       // gray-200
    titleText: "rgb(17, 24, 39)",       // gray-900
    taglineText: "rgb(75, 85, 99)",     // gray-600
    companyText: "rgb(220, 38, 38)",    // red-600
    linkInactive: "rgb(55, 65, 81)",    // gray-700
    linkActive: "rgb(220, 38, 38)",     // red-600
    activeBorder: "rgb(220, 38, 38)",   // red-600
  },
  
  statusBadges: {
    active: {
      background: "rgb(34, 197, 94)",    // green-500
      text: "rgb(255, 255, 255)",        // white
      hover: "rgb(22, 163, 74)",         // green-600
    },
    archived: {
      background: "rgb(249, 250, 251)",  // gray-50
      text: "rgb(107, 114, 128)",        // gray-500
      hover: "rgb(243, 244, 246)",       // gray-100
    },
  },
  
  sections: {
    comingSoon: {
      background: "rgb(240, 253, 244)",  // green-50
      border: "rgb(187, 247, 208)",      // green-200
      titleText: "rgb(22, 101, 52)",     // green-800
      bodyText: "rgb(21, 128, 61)",      // green-700
    },
    error: {
      background: "rgb(254, 242, 242)",  // red-50
      border: "rgb(254, 202, 202)",      // red-200
      titleText: "rgb(153, 27, 27)",     // red-800
      bodyText: "rgb(185, 28, 28)",      // red-700
    },
  },
  
  footer: {
    background: "rgb(255, 255, 255)",   // white
    border: "rgb(229, 231, 235)",       // gray-200
    text: "rgb(75, 85, 99)",            // gray-600
    companyHighlight: "rgb(220, 38, 38)", // red-600
  },
};

// Available color themes
export const colorThemes = {
  fire: fireTheme,
  police: policeTheme,
  medical: medicalTheme,
} as const;

export type ThemeName = keyof typeof colorThemes;

// Get current color configuration
export const getColorConfig = (themeName: ThemeName = 'fire'): ColorConfig => {
  return colorThemes[themeName];
};

// Generate CSS custom properties from color config
export const generateCSSVariables = (colors: ColorConfig): string => {
  return `
    /* Logo Colors */
    --logo-primary: ${colors.logo.primary};
    --logo-primary-end: ${colors.logo.primaryEnd};
    --logo-secondary: ${colors.logo.secondary};
    --logo-secondary-end: ${colors.logo.secondaryEnd};
    --logo-icon: ${colors.logo.icon};
    
    /* Navigation Colors */
    --nav-background: ${colors.navigation.background};
    --nav-border: ${colors.navigation.border};
    --nav-title-text: ${colors.navigation.titleText};
    --nav-tagline-text: ${colors.navigation.taglineText};
    --nav-company-text: ${colors.navigation.companyText};
    --nav-link-inactive: ${colors.navigation.linkInactive};
    --nav-link-active: ${colors.navigation.linkActive};
    --nav-active-border: ${colors.navigation.activeBorder};
    
    /* Status Badge Colors */
    --badge-active-bg: ${colors.statusBadges.active.background};
    --badge-active-text: ${colors.statusBadges.active.text};
    --badge-active-hover: ${colors.statusBadges.active.hover};
    --badge-archived-bg: ${colors.statusBadges.archived.background};
    --badge-archived-text: ${colors.statusBadges.archived.text};
    --badge-archived-hover: ${colors.statusBadges.archived.hover};
    
    /* Section Colors */
    --section-coming-bg: ${colors.sections.comingSoon.background};
    --section-coming-border: ${colors.sections.comingSoon.border};
    --section-coming-title: ${colors.sections.comingSoon.titleText};
    --section-coming-body: ${colors.sections.comingSoon.bodyText};
    --section-error-bg: ${colors.sections.error.background};
    --section-error-border: ${colors.sections.error.border};
    --section-error-title: ${colors.sections.error.titleText};
    --section-error-body: ${colors.sections.error.bodyText};
    
    /* Footer Colors */
    --footer-background: ${colors.footer.background};
    --footer-border: ${colors.footer.border};
    --footer-text: ${colors.footer.text};
    --footer-company-highlight: ${colors.footer.companyHighlight};
  `;
};