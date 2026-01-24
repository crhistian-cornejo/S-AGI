/**
 * Icon Picker - Simple emoji and icon picker for pages
 * Supports emojis and Tabler icons
 */

import { useState, useCallback } from "react";
import {
  IconFileText,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

// Common emojis organized by category
const EMOJI_CATEGORIES = {
  "Frequently Used": ["📄", "📝", "📋", "📌", "⭐", "❤️", "🔥", "✨", "💡", "🎯"],
  "Objects": ["📄", "📝", "📋", "📌", "📎", "📊", "📈", "📉", "📑", "📒", "📓", "📔", "📕", "📗", "📘", "📙", "📚", "📖", "🔖", "🏷️"],
  "Symbols": ["⭐", "❤️", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "☮️"],
  "Activities": ["⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🏉", "🎱", "🏓", "🏸", "🏒", "🏑", "🏏", "🎯", "🎲", "🎮", "🎰", "🎳"],
  "Food": ["🍎", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑", "🥦", "🥬", "🥒"],
  "Travel": ["🚗", "🚕", "🚙", "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒", "🚐", "🚚", "🚛", "🚜", "🏍️", "🛵", "🚲", "🛴", "🛹", "🛼", "🚁"],
  "Nature": ["🌱", "🌲", "🌳", "🌴", "🌵", "🌶️", "🌾", "🌿", "☘️", "🍀", "🍁", "🍂", "🍃", "🌺", "🌻", "🌹", "🌷", "🌼", "🌸", "💐"],
  "Work": ["💼", "📁", "📂", "🗂️", "📅", "📆", "🗒️", "🗓️", "📇", "📈", "📉", "📊", "📋", "📌", "📍", "📎", "🖇️", "📏", "📐", "✂️"],
};

// Tabler icons organized by category
const ICON_CATEGORIES = {
  "Files": [
    { name: "File", icon: IconFileText },
    { name: "Folder", icon: IconFolder },
    { name: "Note", icon: IconNote },
    { name: "Bookmark", icon: IconBookmark },
  ],
  "Actions": [
    { name: "Star", icon: IconStar },
    { name: "Heart", icon: IconHeart },
    { name: "Check", icon: IconCheck },
    { name: "Target", icon: IconTarget },
    { name: "Flag", icon: IconFlag },
  ],
  "UI": [
    { name: "Home", icon: IconHome },
    { name: "Settings", icon: IconSettings },
    { name: "Search", icon: IconSearch },
    { name: "Tag", icon: IconTag },
  ],
  "Time": [
    { name: "Calendar", icon: IconCalendar },
    { name: "Clock", icon: IconClock },
  ],
  "Business": [
    { name: "Briefcase", icon: IconBriefcase },
    { name: "Building", icon: IconBuilding },
    { name: "Users", icon: IconUsers },
    { name: "Chart", icon: IconChartBar },
    { name: "Trending", icon: IconTrendingUp },
  ],
  "Tech": [
    { name: "Desktop", icon: IconDeviceDesktop },
    { name: "Mobile", icon: IconDeviceMobile },
    { name: "Tablet", icon: IconDeviceTablet },
    { name: "Code", icon: IconCode },
    { name: "Database", icon: IconDatabase },
  ],
  "Fun": [
    { name: "Rocket", icon: IconRocket },
    { name: "Flame", icon: IconFlame },
    { name: "Sparkles", icon: IconSparkles },
    { name: "Bulb", icon: IconBulb },
    { name: "ColorSwatch", icon: IconColorSwatch },
  ],
};

interface IconPickerProps {
  currentIcon?: string;
  onSelect: (icon: string) => void;
  children: React.ReactNode;
}

export function IconPicker({ currentIcon, onSelect, children }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"emoji" | "icon">("emoji");

  const handleSelectEmoji = useCallback((emoji: string) => {
    onSelect(emoji);
    setOpen(false);
    setSearchQuery("");
  }, [onSelect]);

  const handleSelectIcon = useCallback((iconName: string) => {
    // Store icon name with prefix to distinguish from emojis
    onSelect(`icon:${iconName}`);
    setOpen(false);
    setSearchQuery("");
  }, [onSelect]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="flex flex-col h-[400px]">
          {/* Tabs */}
          <div className="flex border-b border-border">
            <button
              type="button"
              onClick={() => setActiveTab("emoji")}
              className={cn(
                "flex-1 px-4 py-2 text-sm font-medium transition-colors",
                activeTab === "emoji"
                  ? "bg-accent text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Emoji
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("icon")}
              className={cn(
                "flex-1 px-4 py-2 text-sm font-medium transition-colors",
                activeTab === "icon"
                  ? "bg-accent text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Icons
            </button>
          </div>

          {/* Search */}
          <div className="p-2 border-b border-border">
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8"
            />
          </div>

          {/* Content */}
          <ScrollArea className="flex-1">
            <div className="p-2">
              {activeTab === "emoji" ? (
                <>
                  {Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => {
                    const categoryEmojis = searchQuery
                      ? (category.toLowerCase().includes(searchQuery.toLowerCase()) ? emojis : [])
                      : emojis;
                    
                    if (categoryEmojis.length === 0) return null;

                    return (
                      <div key={category} className="mb-4">
                        <div className="text-xs font-semibold text-muted-foreground mb-2 px-1">
                          {category}
                        </div>
                        <div className="grid grid-cols-8 gap-1">
                          {categoryEmojis.map((emoji) => {
                            const emojiKey = `${category}-${emoji}`;
                            return (
                              <button
                                key={emojiKey}
                                type="button"
                                onClick={() => handleSelectEmoji(emoji)}
                                className={cn(
                                  "w-8 h-8 flex items-center justify-center rounded hover:bg-accent transition-colors text-lg",
                                  currentIcon === emoji && "bg-accent ring-2 ring-primary"
                                )}
                              >
                                {emoji}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : (
                <>
                  {Object.entries(ICON_CATEGORIES).map(([category, icons]) => {
                    const categoryIcons = searchQuery
                      ? icons.filter((icon) => 
                          icon.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          category.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                      : icons;
                    
                    if (categoryIcons.length === 0) return null;

                    return (
                      <div key={category} className="mb-4">
                        <div className="text-xs font-semibold text-muted-foreground mb-2 px-1">
                          {category}
                        </div>
                        <div className="grid grid-cols-6 gap-1">
                          {categoryIcons.map((iconItem) => {
                            const IconComponent = iconItem.icon;
                            const iconValue = `icon:${iconItem.name}`;
                            return (
                              <button
                                key={iconItem.name}
                                type="button"
                                onClick={() => handleSelectIcon(iconItem.name)}
                                className={cn(
                                  "w-8 h-8 flex items-center justify-center rounded hover:bg-accent transition-colors",
                                  currentIcon === iconValue && "bg-accent ring-2 ring-primary"
                                )}
                                title={iconItem.name}
                              >
                                <IconComponent size={16} />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </ScrollArea>

          {/* Remove icon option */}
          {currentIcon && (
            <div className="p-2 border-t border-border">
              <button
                type="button"
                onClick={() => {
                  onSelect("");
                  setOpen(false);
                }}
                className="w-full px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
              >
                Remove icon
              </button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
