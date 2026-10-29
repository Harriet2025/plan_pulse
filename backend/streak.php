<?php
declare(strict_types=1);

/**
 * Streak rules for AuraGoal. The date maths is pure (no database), so it can be tested on its own.
 *
 * A streak counts days in a row on which the user finished a task, with two kinds of forgiveness:
 *   - Rest days: weekdays the user picked (at most 3). Missing one never breaks the streak, and finishing
 *     a task on one still counts.
 *   - Freezes: every 7th day of a streak earns one (a user holds at most 2). A freeze automatically covers one
 *     missed work day, so a single bad day does not reset weeks of effort.
 *
 * Days are the server's local days, and weekdays are ISO numbers (1 = Monday ... 7 = Sunday).
 */

const STREAK_FREEZE_EVERY = 7;
const STREAK_MAX_FREEZES = 2;
const STREAK_MAX_REST_DAYS = 3;
const STREAK_LOOKBACK_DAYS = 31;   // a longer gap than this can never be covered by freezes

/** A user's time zone (sent by their browser), or the server's when it is unknown. */
function user_tz(?string $tz): DateTimeZone
{
    if ($tz) {
        try {
            return new DateTimeZone($tz);
        } catch (Exception) {
            // fall through to the server's zone
        }
    }
    return new DateTimeZone(date_default_timezone_get());
}

/** Midnight today, on the user's own clock: the server may sit in a different time zone from the person. */
function streak_today(?string $tz = null): DateTimeImmutable
{
    return new DateTimeImmutable('today', user_tz($tz));
}

/** Bit 0 = Monday ... bit 6 = Sunday. */
function streak_days_from_mask(int $mask): array
{
    $days = [];
    for ($i = 0; $i < 7; $i++) {
        if (($mask >> $i) & 1) {
            $days[] = $i + 1;
        }
    }
    return $days;
}

function streak_mask_from_days(array $days): int
{
    $mask = 0;
    foreach ($days as $d) {
        $mask |= 1 << ($d - 1);
    }
    return $mask;
}

function streak_is_rest_day(int $mask, DateTimeInterface $day): bool
{
    return ((($mask >> ((int) $day->format('N') - 1)) & 1) === 1);
}

/** Work days (not rest days) strictly between the last active day and today that had no activity. */
function streak_missed_workdays(?string $last, int $mask, DateTimeImmutable $today): int
{
    if ($last === null) {
        return 0;
    }
    $missed = 0;
    $day = (new DateTimeImmutable($last, $today->getTimezone()))->modify('+1 day');   // same zone as $today, or the comparison below is off by the difference
    for ($i = 0; $day < $today; $i++, $day = $day->modify('+1 day')) {
        if ($i >= STREAK_LOOKBACK_DAYS) {
            return 1000;
        }
        if (!streak_is_rest_day($mask, $day)) {
            $missed++;
        }
    }
    return $missed;
}

/**
 * What to show right now. A streak the user can no longer save (too many missed work days, not enough freezes)
 * shows as 0, instead of a stale number that looks alive.
 *
 * @param array{streak_count:int|string,streak_freezes:int|string,rest_days:int|string,last_active_date:?string} $u
 * @return array{count:int,active_today:bool,protected:bool,rest_today:bool,broken:bool}
 */
function streak_view(array $u, DateTimeImmutable $today): array
{
    $streak = (int) $u['streak_count'];
    $mask = (int) $u['rest_days'];
    $missed = streak_missed_workdays($u['last_active_date'], $mask, $today);
    $alive = $streak > 0 && $missed <= (int) $u['streak_freezes'];
    return [
        'count'        => $alive ? $streak : 0,
        'active_today' => $u['last_active_date'] === $today->format('Y-m-d'),
        'protected'    => $alive && $missed > 0,     // a freeze is covering the gap until the next task is finished
        'rest_today'   => streak_is_rest_day($mask, $today),
        'broken'       => $streak > 0 && !$alive,
    ];
}

/**
 * The user finished a task today: work out the new streak state.
 * Events tell the app what to celebrate or explain: freeze_used, freeze_earned, reset.
 *
 * @return array{changed:bool,streak:int,best:int,freezes:int,events:list<array<string,mixed>>}
 */
function streak_advance(array $u, DateTimeImmutable $today): array
{
    $streak = (int) $u['streak_count'];
    $best = (int) $u['best_streak'];
    $freezes = (int) $u['streak_freezes'];
    $events = [];

    if ($u['last_active_date'] === $today->format('Y-m-d')) {
        return ['changed' => false, 'streak' => $streak, 'best' => $best, 'freezes' => $freezes, 'events' => []];
    }

    $missed = streak_missed_workdays($u['last_active_date'], (int) $u['rest_days'], $today);
    if ($streak > 0 && $missed <= $freezes) {
        if ($missed > 0) {
            $freezes -= $missed;
            $events[] = ['type' => 'freeze_used', 'count' => $missed, 'streak' => $streak];
        }
        $streak++;
    } else {
        if ($streak >= 2) {
            $events[] = ['type' => 'reset', 'previous' => $streak, 'best' => max($best, $streak)];
        }
        $streak = 1;
    }

    if ($streak % STREAK_FREEZE_EVERY === 0 && $freezes < STREAK_MAX_FREEZES) {
        $freezes++;
        $events[] = ['type' => 'freeze_earned', 'streak' => $streak];
    }
    return ['changed' => true, 'streak' => $streak, 'best' => max($best, $streak), 'freezes' => $freezes, 'events' => $events];
}

/** Counts today as an active day and saves the result. Returns the new state, with the events to show. */
function touch_streak(PDO $pdo, int $userId): array
{
    $stmt = $pdo->prepare('SELECT streak_count, best_streak, streak_freezes, rest_days, last_active_date, timezone FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $u = $stmt->fetch();
    $today = streak_today($u['timezone']);
    $r = streak_advance($u, $today);
    if ($r['changed']) {
        $pdo->prepare('UPDATE users SET streak_count = ?, best_streak = ?, streak_freezes = ?, last_active_date = ? WHERE id = ?')
            ->execute([$r['streak'], $r['best'], $r['freezes'], $today->format('Y-m-d'), $userId]);
    }
    return $r;
}
