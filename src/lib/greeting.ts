export function greetingForHour(date = new Date()) {
  return date.getHours() < 18 ? "Buongiorno" : "Buonasera";
}
