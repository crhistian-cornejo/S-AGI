/**
 * Time Formatting Utilities
 *
 * Formatea fechas y tiempos de forma legible y profesional
 */

export interface TimeAgoOptions {
  includeDate?: boolean; // Incluir fecha completa además del tiempo relativo
  showSeconds?: boolean; // Mostrar segundos para tiempos muy recientes
  fullFormat?: boolean; // Formato completo con fecha y hora
}

/**
 * Formatea tiempo transcurrido de forma legible
 * Ejemplos: "hace 2 minutos", "hace 3 horas", "hace 2 días"
 */
export function formatTimeAgo(
  date: string | Date,
  options: TimeAgoOptions = {},
): string {
  const {
    includeDate = false,
    showSeconds = false,
    fullFormat = false,
  } = options;
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  // Segundos
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) {
    if (showSeconds && seconds < 10) {
      return `hace ${seconds} segundo${seconds !== 1 ? "s" : ""}`;
    }
    return "hace un momento";
  }

  // Minutos
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const timeStr = minutes === 1 ? "hace 1 minuto" : `hace ${minutes} minutos`;
    if (includeDate) {
      return `${timeStr} · ${formatShortDate(d)}`;
    }
    return timeStr;
  }

  // Horas
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const timeStr = hours === 1 ? "hace 1 hora" : `hace ${hours} horas`;
    if (includeDate) {
      return `${timeStr} · ${formatShortDate(d)}`;
    }
    return timeStr;
  }

  // Días
  const days = Math.floor(hours / 24);
  if (days < 7) {
    if (days === 1) {
      const timeStr = "Ayer";
      if (includeDate) {
        return `${timeStr} · ${formatShortDate(d)}`;
      }
      return timeStr;
    }
    const timeStr = `hace ${days} días`;
    if (includeDate) {
      return `${timeStr} · ${formatShortDate(d)}`;
    }
    return timeStr;
  }

  // Semanas
  const weeks = Math.floor(days / 7);
  if (weeks < 4) {
    const timeStr = weeks === 1 ? "hace 1 semana" : `hace ${weeks} semanas`;
    if (includeDate) {
      return `${timeStr} · ${formatShortDate(d)}`;
    }
    return timeStr;
  }

  // Meses
  const months = Math.floor(days / 30);
  if (months < 12) {
    const timeStr = months === 1 ? "hace 1 mes" : `hace ${months} meses`;
    if (includeDate) {
      return `${timeStr} · ${formatShortDate(d)}`;
    }
    return timeStr;
  }

  // Años
  const years = Math.floor(days / 365);
  const timeStr = years === 1 ? "hace 1 año" : `hace ${years} años`;
  if (includeDate) {
    return `${timeStr} · ${formatShortDate(d)}`;
  }
  return timeStr;
}

/**
 * Formatea fecha corta (ej: "27 Ene")
 */
export function formatShortDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
}

/**
 * Formatea fecha y hora completa
 * Ejemplo: "27 de enero de 2026, 14:30"
 */
export function formatFullDateTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Formatea solo hora (ej: "14:30")
 */
export function formatTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Formatea fecha con hora (ej: "27 Ene, 14:30")
 */
export function formatDateWithTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const dateStr = formatShortDate(d);
  const timeStr = formatTime(d);
  return `${dateStr}, ${timeStr}`;
}

/**
 * Agrupa fechas por categorías (Hoy, Ayer, Esta semana, etc.)
 */
export function getDateGroup(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "Hoy";
  if (days === 1) return "Ayer";
  if (days < 7) return "Esta semana";
  if (days < 30) return "Este mes";

  const month = d.toLocaleDateString("es-ES", {
    month: "long",
    year: "numeric",
  });
  return month.charAt(0).toUpperCase() + month.slice(1);
}
