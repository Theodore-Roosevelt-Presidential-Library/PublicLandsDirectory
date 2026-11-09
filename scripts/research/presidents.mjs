// Presidential terms (start date inclusive). Used to name the administration in office on a given date.
// Inauguration days are flagged as ambiguous: an action dated that day could fall under either President.
export const PRESIDENTS = [
  ['1869-03-04', 'Ulysses S. Grant'], ['1877-03-04', 'Rutherford B. Hayes'], ['1881-03-04', 'James A. Garfield'],
  ['1881-09-19', 'Chester A. Arthur'], ['1885-03-04', 'Grover Cleveland'], ['1889-03-04', 'Benjamin Harrison'],
  ['1893-03-04', 'Grover Cleveland'], ['1897-03-04', 'William McKinley'], ['1901-09-14', 'Theodore Roosevelt'],
  ['1909-03-04', 'William Howard Taft'], ['1913-03-04', 'Woodrow Wilson'], ['1921-03-04', 'Warren G. Harding'],
  ['1923-08-02', 'Calvin Coolidge'], ['1929-03-04', 'Herbert Hoover'], ['1933-03-04', 'Franklin D. Roosevelt'],
  ['1945-04-12', 'Harry S. Truman'], ['1953-01-20', 'Dwight D. Eisenhower'], ['1961-01-20', 'John F. Kennedy'],
  ['1963-11-22', 'Lyndon B. Johnson'], ['1969-01-20', 'Richard Nixon'], ['1974-08-09', 'Gerald R. Ford'],
  ['1977-01-20', 'Jimmy Carter'], ['1981-01-20', 'Ronald Reagan'], ['1989-01-20', 'George H. W. Bush'],
  ['1993-01-20', 'Bill Clinton'], ['2001-01-20', 'George W. Bush'], ['2009-01-20', 'Barack Obama'],
  ['2017-01-20', 'Donald J. Trump'], ['2021-01-20', 'Joseph R. Biden Jr.'], ['2025-01-20', 'Donald J. Trump'],
];
const EARLIER = [['1789-04-30', 'George Washington'], ['1797-03-04', 'John Adams'], ['1801-03-04', 'Thomas Jefferson'], ['1809-03-04', 'James Madison'], ['1817-03-04', 'James Monroe'], ['1825-03-04', 'John Quincy Adams'], ['1829-03-04', 'Andrew Jackson'], ['1837-03-04', 'Martin Van Buren'], ['1841-03-04', 'William Henry Harrison'], ['1841-04-04', 'John Tyler'], ['1845-03-04', 'James K. Polk'], ['1849-03-05', 'Zachary Taylor'], ['1850-07-09', 'Millard Fillmore'], ['1853-03-04', 'Franklin Pierce'], ['1857-03-04', 'James Buchanan'], ['1861-03-04', 'Abraham Lincoln'], ['1865-04-15', 'Andrew Johnson']];
const ALL = [...EARLIER, ...PRESIDENTS];

// Returns { name, ambiguous } for an ISO date.
export function presidentOn(iso) {
  let cur = null;
  for (const [start, name] of ALL) { if (iso >= start) cur = { name, start }; else break; }
  if (!cur) return null;
  const ambiguous = ALL.some(([start]) => start === iso) || ['1841-04-04', '1850-07-09', '1865-04-15', '1881-09-19', '1901-09-14', '1923-08-02', '1945-04-12', '1963-11-22', '1974-08-09'].includes(iso);
  return { name: cur.name, ambiguous };
}
