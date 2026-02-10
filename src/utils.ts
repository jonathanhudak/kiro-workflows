const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const NC = "\x1b[0m";

export function log(msg: string) {
  console.error(`${BLUE}[kiro-workflow]${NC} ${msg}`);
}

export function success(msg: string) {
  console.error(`${GREEN}[kiro-workflow]${NC} ${msg}`);
}

export function warn(msg: string) {
  console.error(`${YELLOW}[kiro-workflow]${NC} ${msg}`);
}

export function error(msg: string) {
  console.error(`${RED}[kiro-workflow]${NC} ${msg}`);
}
