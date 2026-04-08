from flask import Blueprint, render_template

workoutplanner_bp = Blueprint('workoutplanner_bp', __name__)


@workoutplanner_bp.route('/workout-planner')
def workout_planner():
    return render_template('workoutplanner.html')
