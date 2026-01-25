/**
 * Utility functions for rendering note page icons
 * Supports both emojis and Tabler icons
 */

import type React from "react";
import { IconFileText } from "@tabler/icons-react";
import {
  IconFolder,
  IconStar,
  IconHeart,
  IconBookmark,
  IconNote,
  IconBulb,
  IconCheck,
  IconTarget,
  IconFlag,
  IconHome,
  IconSettings,
  IconSearch,
  IconTag,
  IconCalendar,
  IconClock,
  IconBriefcase,
  IconBuilding,
  IconUsers,
  IconChartBar,
  IconTrendingUp,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconCode,
  IconDatabase,
  IconRocket,
  IconFlame,
  IconSparkles,
  IconColorSwatch,
} from "@tabler/icons-react";

// Map of icon names to Tabler icon components
const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  File: IconFileText,
  Folder: IconFolder,
  Star: IconStar,
  Heart: IconHeart,
  Bookmark: IconBookmark,
  Note: IconNote,
  Bulb: IconBulb,
  Check: IconCheck,
  Target: IconTarget,
  Flag: IconFlag,
  Home: IconHome,
  Settings: IconSettings,
  Search: IconSearch,
  Tag: IconTag,
  Calendar: IconCalendar,
  Clock: IconClock,
  Briefcase: IconBriefcase,
  Building: IconBuilding,
  Users: IconUsers,
  Chart: IconChartBar,
  Trending: IconTrendingUp,
  Desktop: IconDeviceDesktop,
  Mobile: IconDeviceMobile,
  Tablet: IconDeviceTablet,
  Code: IconCode,
  Database: IconDatabase,
  Rocket: IconRocket,
  Flame: IconFlame,
  Sparkles: IconSparkles,
  ColorSwatch: IconColorSwatch,
};

/**
 * Render an icon based on the icon string
 * @param icon - Icon string (emoji or "icon:IconName")
 * @param size - Size of the icon
 * @param className - Additional CSS classes
 * @returns React node with the icon
 */
export function renderPageIcon(
  icon: string | undefined,
  size: number = 16,
  className?: string
): React.ReactNode {
  if (!icon) {
    return <IconFileText size={size} className={className} />;
  }

  // Check if it's a Tabler icon (prefixed with "icon:")
  if (icon.startsWith("icon:")) {
    const iconName = icon.replace("icon:", "");
    const IconComponent = ICON_MAP[iconName];
    if (IconComponent) {
      return <IconComponent size={size} className={className} />;
    }
    // Fallback to default icon if not found
    return <IconFileText size={size} className={className} />;
  }

  // Otherwise, it's an emoji
  return <span className={className} style={{ fontSize: size }}>{icon}</span>;
}
