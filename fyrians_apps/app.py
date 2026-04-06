import os
import random
import heapq
import time
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

# --- Load Words for Typing App ---
ALL_WORDS = ["the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on", "with"]
try:
    if os.path.exists('words.txt'):
        with open('words.txt', 'r', encoding='utf-8') as f:
            words_from_file = [line.strip().lower() for line in f if line.strip()]
            if words_from_file:
                ALL_WORDS = words_from_file
        print(f"Loaded {len(ALL_WORDS)} words successfully!")
    else:
        print("words.txt not found. Using default fallback words.")
except Exception as e:
    print(f"Error loading words.txt: {e}")

# --- Schedule Optimizer Logic ---
def solve_schedule(students, time_slots):
    n = len(students)
    score_matrix = [[0] * n for _ in range(n)]
    for i, student in enumerate(students):
        for pref_rank, slot in enumerate(student["preferences"]):
            if slot > 0:
                score_matrix[i][slot - 1] = 3 - pref_rank

    best = {"score": -999999, "assignment": None}
    nodes_explored = [0]

    def calculate_upper_bound(slots, used, depth, score):
        bound = score
        for i in range(depth, n):
            max_possible = 0
            has_preferences = any(p != 0 for p in students[i]["preferences"])
            for j, pref in enumerate(students[i]["preferences"]):
                if pref > 0 and not used[pref - 1]:
                    max_possible = 3 - j
                    break
            if has_preferences and max_possible == 0:
                bound -= 10
            else:
                bound += max_possible
        return bound

    initial_used = [False] * n
    initial_bound = calculate_upper_bound([], initial_used, 0, 0)
    heap = [(-initial_bound, 0, [], tuple(initial_used), 0)]

    while heap:
        neg_bound, depth, slots, used_tuple, score = heapq.heappop(heap)
        nodes_explored[0] += 1
        bound = -neg_bound

        if bound <= best["score"]:
            continue

        if depth == n:
            if score > best["score"]:
                best["score"] = score
                best["assignment"] = list(slots)
            continue

        used = list(used_tuple)
        student_idx = depth
        candidates = []
        has_preferences = any(p != 0 for p in students[student_idx]["preferences"])

        for j, pref in enumerate(students[student_idx]["preferences"]):
            if pref > 0 and not used[pref - 1]:
                candidates.append((3 - j, pref - 1))

        if not candidates:
            count = 0
            for slot in range(n):
                if count >= 3:
                    break
                if not used[slot] and score_matrix[student_idx][slot] == 0:
                    score_adj = -10 if has_preferences else 0
                    candidates.append((score_adj, slot))
                    count += 1

        for gain, slot in candidates:
            new_used = list(used)
            new_used[slot] = True
            new_slots = slots + [slot]
            new_score = score + gain
            new_bound = calculate_upper_bound(new_slots, new_used, depth + 1, new_score)
            if new_bound > best["score"]:
                heapq.heappush(heap, (-new_bound, depth + 1, new_slots, tuple(new_used), new_score))

    assignment = best["assignment"]
    if assignment is None:
        return None

    results = []
    first_choice = second_choice = third_choice = no_pref_missed = no_pref_given = 0

    for i in range(n):
        slot_idx = assignment[i]
        points = score_matrix[i][slot_idx]
        had_prefs = any(p != 0 for p in students[i]["preferences"])

        if points == 3:
            rank = 1
            first_choice += 1
        elif points == 2:
            rank = 2
            second_choice += 1
        elif points == 1:
            rank = 3
            third_choice += 1
        elif had_prefs:
            rank = 0 
            no_pref_missed += 1
        else:
            rank = -1 
            no_pref_given += 1

        results.append({
            "student": students[i]["name"],
            "slot": time_slots[slot_idx],
            "rank": rank,
            "hadPreferences": had_prefs
        })

    display_score = sum(score_matrix[i][assignment[i]] for i in range(n) if score_matrix[i][assignment[i]] > 0)
    max_score = n * 3

    return {
        "assignments": results,
        "score": display_score,
        "maxScore": max_score,
        "satisfaction": round(display_score * 100.0 / max_score, 1) if max_score > 0 else 0,
        "firstChoice": first_choice,
        "secondChoice": second_choice,
        "thirdChoice": third_choice,
        "noPrefMissed": no_pref_missed,
        "noPrefGiven": no_pref_given,
        "nodesExplored": nodes_explored[0]
    }

# --- Routes ---
@app.route('/')
def home():
    return render_template('home.html')

@app.route('/schedule')
def schedule():
    return render_template('schedule.html')

@app.route('/typing')
def typing():
    return render_template('typing.html')

@app.route('/api/optimize', methods=['POST'])
def api_optimize():
    data = request.json
    students = data.get('students', [])
    time_slots = data.get('timeSlots', [])

    if not students or not time_slots:
        return jsonify({"error": "Missing students or time slots"}), 400
    if len(students) != len(time_slots):
        return jsonify({"error": "Number of students must equal number of time slots"}), 400

    start = time.time()
    result = solve_schedule(students, time_slots)
    elapsed = round((time.time() - start) * 1000, 2)

    if result is None:
        return jsonify({"error": "Could not find a valid assignment"}), 500

    result["timeMs"] = elapsed
    return jsonify(result)

@app.route('/api/words')
def api_words():
    # Return 100 random words, safely checking sample size
    sample_size = min(100, len(ALL_WORDS))
    selected_words = random.sample(ALL_WORDS, sample_size)
    return jsonify(selected_words)

if __name__ == '__main__':
    app.run(debug=True)