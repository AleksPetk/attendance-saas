/**
 * Deterministic fake participants for Kiosk Builder Card density testing.
 * Never persisted; never loaded from Members / GroupMemberships / attendance.
 */

export const FAKE_PARTICIPANT_COUNTS = [6, 12, 20, 50, 100];
export const DEFAULT_FAKE_PARTICIPANT_COUNT = 12;

const FAKE_POOL = [
  { name: "Ada Lovelace", code: "1001", email: "ada.lovelace" },
  { name: "Alex Chen", code: "1002", email: "alex.chen" },
  { name: "Alex Rivera", code: "5831", email: "alex.rivera" },
  { name: "Bo Kim", code: "1042", email: "bo.kim" },
  { name: "Grace Hopper", code: "1005", email: "grace.hopper" },
  { name: "Katherine Johnson", code: "1006", email: "katherine.johnson" },
  { name: "Li Wei", code: "2210", email: "li.wei" },
  { name: "Margaret Hamilton", code: "1008", email: "margaret.hamilton" },
  { name: "Tim Berners-Lee", code: "1009", email: "tim.bernerslee" },
  { name: "Barbara Liskov", code: "1010", email: "barbara.liskov" },
  { name: "Jo Park", code: "7740", email: "jo.park" },
  { name: "Radia Perlman", code: "1012", email: "radia.perlman" },
  { name: "Edsger Dijkstra", code: "1013", email: "edsger.dijkstra" },
  { name: "Frances Allen", code: "1014", email: "frances.allen" },
  { name: "Ken Thompson", code: "1015", email: "ken.thompson" },
  { name: "Jean Bartik", code: "1016", email: "jean.bartik" },
  { name: "Dennis Ritchie", code: "1017", email: "dennis.ritchie" },
  { name: "Hedy Lamarr", code: "1018", email: "hedy.lamarr" },
  { name: "John von Neumann", code: "1019", email: "john.vonneumann" },
  { name: "Dorothy Vaughan", code: "1020", email: "dorothy.vaughan" },
  { name: "Alan Turing", code: "1021", email: "alan.turing" },
  { name: "Linus Torvalds", code: "1022", email: "linus.torvalds" },
  { name: "Donald Knuth", code: "1023", email: "donald.knuth" },
  { name: "Maya Smith", code: "1024", email: "maya.smith" },
  { name: "Jordan Lee", code: "1025", email: "jordan.lee" },
];

function padCode(n) {
  return String(1000 + (n % 9000)).padStart(4, "0");
}

/**
 * @param {number} count
 * @returns {{ id: string, name: string, participant_code: string, email: string }[]}
 */
export function createFakeParticipants(count) {
  const size = FAKE_PARTICIPANT_COUNTS.includes(count)
    ? count
    : DEFAULT_FAKE_PARTICIPANT_COUNT;
  const people = [];
  for (let i = 0; i < size; i += 1) {
    const template = FAKE_POOL[i % FAKE_POOL.length];
    const cycle = Math.floor(i / FAKE_POOL.length);
    const name = cycle === 0 ? template.name : `${template.name} ${cycle + 1}`;
    const codeSuffix = cycle === 0 ? template.code : padCode(i + 1);
    const emailLocal =
      cycle === 0 ? template.email : `${template.email}.${cycle + 1}`;
    people.push({
      id: `fake-${i + 1}`,
      name,
      participant_code: `G12-${codeSuffix}`,
      email: `${emailLocal}@example.test`,
    });
  }
  return people;
}
