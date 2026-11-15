#!/usr/bin/env python
"""Generate a fictional astronaut-health dataset and its 12 requested plots."""

from __future__ import annotations

import argparse
import math
import os
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")

import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


SECONDS_PER_DAY = 24 * 60 * 60
MISSION_START = pd.Timestamp("2026-11-14T18:00:00Z")
PROVENANCE = "SYNTHETIC_DEMO"
DATA_CLASS = "Synthetic Demo"
ASTRONAUT_COLORS = {
    "AST-001": "blue",
    "AST-002": "orange",
    "AST-003": "green",
    "AST-004": "red",
}
ASTRONAUT_PROFILES: list[dict[str, Any]] = [
    {
        "astronaut_id": "AST-001",
        "astronaut_name": "Avery Quinn",
        "mission_role": "Mission Specialist",
        "age": 34,
        "baseline_fitness": 86,
        "baseline_sleep_hours": 7.4,
        "baseline_sleep_quality": 82,
        "data_class": DATA_CLASS,
        "provenance": PROVENANCE,
    },
    {
        "astronaut_id": "AST-002",
        "astronaut_name": "Riley Chen",
        "mission_role": "Flight Engineer",
        "age": 38,
        "baseline_fitness": 79,
        "baseline_sleep_hours": 6.7,
        "baseline_sleep_quality": 76,
        "data_class": DATA_CLASS,
        "provenance": PROVENANCE,
    },
    {
        "astronaut_id": "AST-003",
        "astronaut_name": "Morgan Patel",
        "mission_role": "Science Specialist",
        "age": 32,
        "baseline_fitness": 91,
        "baseline_sleep_hours": 7.8,
        "baseline_sleep_quality": 86,
        "data_class": DATA_CLASS,
        "provenance": PROVENANCE,
    },
    {
        "astronaut_id": "AST-004",
        "astronaut_name": "Jordan Reyes",
        "mission_role": "Pilot",
        "age": 41,
        "baseline_fitness": 74,
        "baseline_sleep_hours": 6.2,
        "baseline_sleep_quality": 71,
        "data_class": DATA_CLASS,
        "provenance": PROVENANCE,
    },
]

PLOT_SPECS = [
    ("01_heart_rate.png", "Heart Rate — All Astronauts", "heart_rate_bpm", "BPM"),
    ("02_spo2.png", "Blood Oxygen Saturation (SpO2)", "spo2_percent", "%"),
    ("03_radiation_dose_rate.png", "Radiation Dose Rate", "radiation_dose_rate_uSv_h", "uSv/h"),
    ("04_cumulative_dose.png", "Cumulative Radiation Dose", "cumulative_radiation_dose_uSv", "uSv"),
    ("05_systolic_bp.png", "Systolic Blood Pressure", "systolic_blood_pressure_mmHg", "mmHg"),
    ("06_diastolic_bp.png", "Diastolic Blood Pressure", "diastolic_blood_pressure_mmHg", "mmHg"),
    ("07_body_temperature.png", "Body Temperature", "body_temperature_C", "C"),
    ("08_breathing_rate.png", "Breathing Rate", "breathing_rate_breaths_min", "breaths/min"),
    ("09_activity.png", "Physical Activity Intensity", "activity_intensity", "0-100"),
    ("10_muscle_perf.png", "Muscle Performance Score", "muscle_performance_score", "0-100"),
]


def _timestamps(
    sample_count: int,
    sample_interval_seconds: int,
    start_time: pd.Timestamp = MISSION_START,
) -> pd.DatetimeIndex:
    start = pd.Timestamp(start_time)
    if start.tzinfo is None:
        start = start.tz_localize("UTC")
    else:
        start = start.tz_convert("UTC")
    return pd.date_range(
        start=start,
        periods=sample_count,
        freq=pd.to_timedelta(sample_interval_seconds, unit="s"),
    )


def generate_environment_data(
    sample_count: int,
    sample_interval_seconds: int = 5,
    seed: int = 2026,
    start_time: pd.Timestamp = MISSION_START,
) -> pd.DataFrame:
    """Create shared cabin-environment samples with daily and slower variation."""
    if sample_count <= 0:
        raise ValueError("Sample count must be greater than zero.")
    if sample_interval_seconds <= 0:
        raise ValueError("Sample interval must be greater than zero.")
    rng = np.random.default_rng(seed)
    elapsed_seconds = np.arange(sample_count, dtype=np.float64) * sample_interval_seconds
    daily_phase = 2 * np.pi * elapsed_seconds / SECONDS_PER_DAY
    six_hour_phase = 2 * np.pi * elapsed_seconds / (6 * 60 * 60)

    oxygen = 20.95 + 0.025 * np.sin(daily_phase) + rng.normal(0, 0.008, sample_count)
    temperature = 22.0 + 0.35 * np.sin(daily_phase - 0.8) + rng.normal(0, 0.045, sample_count)
    pressure = 101.3 + 0.22 * np.sin(six_hour_phase) + 0.08 * np.sin(daily_phase) + rng.normal(0, 0.025, sample_count)
    humidity = 45.0 + 2.8 * np.sin(daily_phase + 0.5) + 0.9 * np.sin(six_hour_phase) + rng.normal(0, 0.2, sample_count)

    return pd.DataFrame(
        {
            "timestamp": _timestamps(sample_count, sample_interval_seconds, start_time),
            "cabin_oxygen_percent": np.clip(oxygen, 20.7, 21.2).astype(np.float32),
            "cabin_temperature_C": np.clip(temperature, 20.5, 23.5).astype(np.float32),
            "cabin_pressure_kPa": np.clip(pressure, 100.5, 102.1).astype(np.float32),
            "cabin_humidity_percent": np.clip(humidity, 35, 55).astype(np.float32),
            "data_class": pd.Categorical([DATA_CLASS] * sample_count),
            "provenance": pd.Categorical([PROVENANCE] * sample_count),
        }
    )


def generate_synthetic_astronaut_signals(
    profile: dict[str, Any],
    timestamps: pd.DatetimeIndex,
    sample_interval_seconds: int = 5,
    seed: int = 2026,
) -> pd.DataFrame:
    """Generate one astronaut's 5-second health signals; values are fictional."""
    sample_count = len(timestamps)
    if sample_count <= 0:
        raise ValueError("At least one timestamp is required.")
    if sample_interval_seconds <= 0:
        raise ValueError("Sample interval must be greater than zero.")
    rng = np.random.default_rng(seed)
    elapsed_seconds = np.arange(sample_count, dtype=np.float64) * sample_interval_seconds
    elapsed_days = elapsed_seconds / SECONDS_PER_DAY
    day_phase = 2 * np.pi * elapsed_seconds / SECONDS_PER_DAY
    orbit_phase = 2 * np.pi * elapsed_seconds / (90 * 60)
    mission_day = np.floor(elapsed_days).astype(np.int16) + 1
    hour_of_day = (elapsed_seconds / 3600) % 24
    sleep_window = (hour_of_day < 6) | (hour_of_day >= 23)

    fitness = float(profile["baseline_fitness"])
    astronaut_id = str(profile["astronaut_id"])
    if astronaut_id not in ASTRONAUT_COLORS:
        raise ValueError(f"Unknown astronaut ID: {astronaut_id}.")
    phase_offset = (int(astronaut_id[-1]) - 1) * 0.7
    activity_cycle = 18 + 32 * (0.5 + 0.5 * np.sin(day_phase - np.pi / 2 + phase_offset))
    exercise_pulses = 20 * np.maximum(0, np.sin(orbit_phase + phase_offset)) ** 8
    activity = np.clip(activity_cycle + exercise_pulses + rng.normal(0, 5.5, sample_count), 0, 100)
    activity[sleep_window] = np.clip(rng.normal(4, 2, int(sleep_window.sum())), 0, 10)

    resting_heart_rate = 71 - 0.12 * (fitness - 75)
    heart_rate = resting_heart_rate + 2.4 * np.sin(day_phase - 0.4 + phase_offset) + 0.13 * activity
    heart_rate += rng.normal(0, 1.7, sample_count)

    spo2 = 98.0 + 0.25 * np.sin(day_phase + phase_offset) + rng.normal(0, 0.18, sample_count)
    radiation_rate = 0.085 + 0.018 * np.sin(orbit_phase) + rng.normal(0, 0.006, sample_count)
    radiation_rate = np.clip(radiation_rate, 0.02, None)

    radiation_spike_index = min(sample_count - 1, max(0, int(sample_count * 0.42)))
    spo2_dip_index = min(sample_count - 1, max(0, int(sample_count * 0.72)))
    if astronaut_id == "AST-001":
        distance = elapsed_seconds - radiation_spike_index * sample_interval_seconds
        radiation_rate += 2.4 * np.exp(-0.5 * (distance / 240) ** 2)
    if astronaut_id == "AST-002":
        distance = elapsed_seconds - spo2_dip_index * sample_interval_seconds
        spo2 -= 8.5 * np.exp(-0.5 * (distance / 180) ** 2)
    spo2 = np.clip(spo2, 88, 100)

    systolic = 113 + 3.5 * np.sin(day_phase - 0.7 + phase_offset) + 0.065 * activity
    systolic += rng.normal(0, 2.2, sample_count)
    diastolic = 72 + 2.1 * np.sin(day_phase - 0.3 + phase_offset) + 0.035 * activity
    diastolic += rng.normal(0, 1.5, sample_count)
    body_temperature = 36.7 + 0.22 * np.sin(day_phase - 1.1 + phase_offset)
    body_temperature += rng.normal(0, 0.055, sample_count)
    breathing_rate = 13.4 + 1.0 * np.sin(day_phase - 0.2 + phase_offset) + 0.035 * activity
    breathing_rate += rng.normal(0, 0.65, sample_count)

    day_count = int(mission_day[-1])
    day_indices = np.arange(day_count, dtype=np.float64)
    sleep_duration_daily = float(profile["baseline_sleep_hours"])
    sleep_duration_daily += 0.45 * np.sin(2 * np.pi * day_indices / 7 + phase_offset)
    sleep_duration_daily += rng.normal(0, 0.24, day_count)
    sleep_quality_daily = float(profile["baseline_sleep_quality"])
    sleep_quality_daily += 5 * np.sin(2 * np.pi * day_indices / 9 + phase_offset)
    sleep_quality_daily += rng.normal(0, 2.2, day_count)
    sleep_duration = np.clip(sleep_duration_daily[mission_day - 1], 4.0, 9.5)
    sleep_quality = np.clip(sleep_quality_daily[mission_day - 1], 35, 100)

    muscle_score = fitness - 0.035 * elapsed_days + 1.6 * np.sin(2 * np.pi * elapsed_days / 14 + phase_offset)
    muscle_score += rng.normal(0, 0.75, sample_count)
    cumulative_dose = np.cumsum(radiation_rate, dtype=np.float64) * sample_interval_seconds / 3600

    return pd.DataFrame(
        {
            "timestamp": timestamps,
            "mission_day": mission_day,
            "astronaut_id": pd.Categorical([astronaut_id] * sample_count, categories=list(ASTRONAUT_COLORS)),
            "heart_rate_bpm": np.clip(heart_rate, 45, 150).astype(np.float32),
            "spo2_percent": spo2.astype(np.float32),
            "radiation_dose_rate_uSv_h": radiation_rate.astype(np.float32),
            "cumulative_radiation_dose_uSv": cumulative_dose.astype(np.float32),
            "systolic_blood_pressure_mmHg": np.clip(systolic, 80, 190).astype(np.float32),
            "diastolic_blood_pressure_mmHg": np.clip(diastolic, 45, 120).astype(np.float32),
            "body_temperature_C": np.clip(body_temperature, 35.5, 39.0).astype(np.float32),
            "breathing_rate_breaths_min": np.clip(breathing_rate, 6, 35).astype(np.float32),
            "activity_intensity": activity.astype(np.float32),
            "muscle_performance_score": np.clip(muscle_score, 0, 100).astype(np.float32),
            "sleep_duration_hours": sleep_duration.astype(np.float32),
            "sleep_quality_score": sleep_quality.astype(np.float32),
            "data_class": pd.Categorical([DATA_CLASS] * sample_count),
            "provenance": pd.Categorical([PROVENANCE] * sample_count),
        }
    )


def build_dataframe_for_all_astronauts(
    profiles: list[dict[str, Any]],
    timestamps: pd.DatetimeIndex,
    sample_interval_seconds: int = 5,
    seed: int = 2026,
) -> pd.DataFrame:
    """Build the combined synthetic sensor table for every configured astronaut."""
    frames = [
        generate_synthetic_astronaut_signals(
            profile,
            timestamps,
            sample_interval_seconds=sample_interval_seconds,
            seed=seed + index * 101,
        )
        for index, profile in enumerate(profiles)
    ]
    if not frames:
        raise ValueError("At least one astronaut profile is required.")
    return pd.concat(frames, ignore_index=True, copy=False)


def add_anomaly_alert_events(
    sensor_data: pd.DataFrame,
) -> pd.DataFrame:
    """Create alert rows for the two deliberate, clearly synthetic anomalies."""
    event_specs = [
        {
            "astronaut_id": "AST-001",
            "fraction": 0.42,
            "alert_type": "Radiation dose-rate spike",
            "metric": "radiation_dose_rate_uSv_h",
            "unit": "uSv/h",
            "threshold": 1.0,
            "description": "Synthetic radiation-rate spike inserted for chart demonstration.",
        },
        {
            "astronaut_id": "AST-002",
            "fraction": 0.72,
            "alert_type": "Low SpO2 dip",
            "metric": "spo2_percent",
            "unit": "%",
            "threshold": 92.0,
            "description": "Synthetic SpO2 dip inserted for chart demonstration.",
        },
    ]
    alerts: list[dict[str, Any]] = []
    for spec in event_specs:
        astronaut_rows = sensor_data.loc[sensor_data["astronaut_id"] == spec["astronaut_id"]]
        if astronaut_rows.empty:
            continue
        event_index = min(len(astronaut_rows) - 1, int(len(astronaut_rows) * spec["fraction"]))
        sample = astronaut_rows.iloc[event_index]
        alerts.append(
            {
                "event_id": f"DEMO-{spec['astronaut_id']}-{spec['metric']}",
                "timestamp": sample["timestamp"],
                "astronaut_id": spec["astronaut_id"],
                "alert_type": spec["alert_type"],
                "metric": spec["metric"],
                "value": float(sample[spec["metric"]]),
                "unit": spec["unit"],
                "threshold": spec["threshold"],
                "description": spec["description"],
                "data_class": DATA_CLASS,
                "provenance": PROVENANCE,
            }
        )
    return pd.DataFrame(alerts)


def _atomic_to_csv(frame: pd.DataFrame, output_path: Path) -> None:
    temporary_path = output_path.with_name(f".{output_path.name}.tmp")
    try:
        frame.to_csv(
            temporary_path,
            index=False,
            encoding="utf-8",
            chunksize=50_000,
            float_format="%.4f",
        )
        os.replace(temporary_path, output_path)
    except OSError as error:
        raise OSError(f"Could not export CSV to {output_path}: {error}") from error
    finally:
        temporary_path.unlink(missing_ok=True)


def save_csv_files(
    astronaut_profiles: pd.DataFrame,
    sensor_data: pd.DataFrame,
    alerts: pd.DataFrame,
    environment_data: pd.DataFrame,
    output_folder: Path,
    mission_days: float = 21,
    sample_interval_seconds: int = 5,
) -> dict[str, Path]:
    """Atomically export each dataset CSV and a data-integrity README."""
    output_folder.mkdir(parents=True, exist_ok=True)
    outputs = {
        "astronaut_profiles": output_folder / "astronaut_profiles.csv",
        "sensor_data": output_folder / "sensor_data.csv",
        "alerts": output_folder / "alerts.csv",
        "environment_data": output_folder / "environment_data.csv",
    }
    for name, frame in (
        ("astronaut_profiles", astronaut_profiles),
        ("sensor_data", sensor_data),
        ("alerts", alerts),
        ("environment_data", environment_data),
    ):
        _atomic_to_csv(frame, outputs[name])

    readme = (
        "# AI Space Guardian synthetic dataset\n\n"
        f"- Mission duration: {mission_days:g} days\n"
        f"- Sample interval: {sample_interval_seconds} seconds\n"
        "- Crew: AST-001, AST-002, AST-003, AST-004\n\n"
        "All records, profiles, alerts, and plots in this folder are synthetic "
        "demonstration content. They are not real astronaut or spacecraft data, "
        "are not medically validated, and must not be used for diagnosis, treatment, "
        "flight operations, or safety decisions. The included anomaly events are "
        "deliberately generated for visualization testing.\n"
    )
    readme_path = output_folder / "README.md"
    temporary_readme = readme_path.with_name(f".{readme_path.name}.tmp")
    try:
        temporary_readme.write_text(readme, encoding="utf-8")
        os.replace(temporary_readme, readme_path)
    except OSError as error:
        raise OSError(f"Could not write dataset description to {readme_path}: {error}") from error
    finally:
        temporary_readme.unlink(missing_ok=True)

    return outputs


def _downsample_for_plot(group: pd.DataFrame, sample_interval_seconds: int) -> pd.DataFrame:
    stride = max(1, int(round(300 / sample_interval_seconds)))
    return group.iloc[::stride]


def _style_axes(ax: plt.Axes) -> None:
    ax.set_facecolor("#f1f2f3")
    ax.grid(True, color="#aeb4b9", alpha=0.32, linewidth=0.6)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.tick_params(axis="both", labelsize=8, colors="#454b50")


def _save_line_plot(
    sensor_data: pd.DataFrame,
    output_path: Path,
    title: str,
    metric: str,
    ylabel: str,
    sample_interval_seconds: int,
) -> None:
    fig, ax = plt.subplots(figsize=(11, 4.5))
    try:
        for astronaut_id, group in sensor_data.groupby("astronaut_id", sort=False, observed=True):
            sampled = _downsample_for_plot(group, sample_interval_seconds)
            ax.plot(
                sampled["timestamp"],
                sampled[metric],
                label=str(astronaut_id),
                color=ASTRONAUT_COLORS[str(astronaut_id)],
                linewidth=0.9,
            )
        _style_axes(ax)
        ax.set_title(title, fontsize=12, color="#252a2e", pad=10)
        ax.set_ylabel(ylabel, fontsize=9)
        ax.set_xlabel("Time", fontsize=9)
        ax.xaxis.set_major_locator(mdates.AutoDateLocator(minticks=5, maxticks=9))
        ax.xaxis.set_major_formatter(mdates.ConciseDateFormatter(ax.xaxis.get_major_locator()))
        ax.legend(loc="upper right", frameon=True, framealpha=0.9, fontsize=8)
        fig.tight_layout()
        fig.savefig(output_path, dpi=110, facecolor=fig.get_facecolor())
    finally:
        plt.close(fig)


def create_full_visualizations(
    sensor_data: pd.DataFrame,
    environment_data: pd.DataFrame,
    output_folder: Path,
    sample_interval_seconds: int = 5,
) -> list[Path]:
    """Write the ten astronaut line charts, sleep summary, and four-panel cabin plot."""
    output_folder.mkdir(parents=True, exist_ok=True)
    created: list[Path] = []
    for filename, title, metric, ylabel in PLOT_SPECS:
        output_path = output_folder / filename
        _save_line_plot(
            sensor_data,
            output_path,
            title,
            metric,
            ylabel,
            sample_interval_seconds,
        )
        created.append(output_path)

    sleep_maxima = (
        sensor_data.groupby("astronaut_id", observed=True)["sleep_duration_hours"]
        .max()
        .reindex(list(ASTRONAUT_COLORS))
    )
    sleep_path = output_folder / "11_sleep_duration.png"
    fig, ax = plt.subplots(figsize=(7, 4))
    try:
        ax.bar(
            sleep_maxima.index.astype(str),
            sleep_maxima.to_numpy(),
            color=[ASTRONAUT_COLORS[astronaut_id] for astronaut_id in sleep_maxima.index.astype(str)],
            width=0.65,
        )
        _style_axes(ax)
        ax.set_title("Max Sleep Duration (24h window)", fontsize=12, color="#252a2e", pad=10)
        ax.set_xlabel("Astronaut ID", fontsize=9)
        ax.set_ylabel("Hours", fontsize=9)
        fig.tight_layout()
        fig.savefig(sleep_path, dpi=110, facecolor=fig.get_facecolor())
    finally:
        plt.close(fig)
    created.append(sleep_path)

    environment_path = output_folder / "12_environment.png"
    environment_specs = [
        ("cabin_oxygen_percent", "Cabin Oxygen", "%", "#4c78a8"),
        ("cabin_temperature_C", "Cabin Temperature", "C", "#f28e2b"),
        ("cabin_pressure_kPa", "Cabin Pressure", "kPa", "#59a14f"),
        ("cabin_humidity_percent", "Cabin Humidity", "%", "#e15759"),
    ]
    fig, axes = plt.subplots(4, 1, figsize=(11, 9), sharex=True)
    try:
        stride = max(1, int(round(300 / sample_interval_seconds)))
        sampled_environment = environment_data.iloc[::stride]
        for ax, (column, title, ylabel, color) in zip(axes, environment_specs):
            ax.plot(
                sampled_environment["timestamp"],
                sampled_environment[column],
                color=color,
                linewidth=0.95,
            )
            _style_axes(ax)
            ax.set_title(title, loc="left", fontsize=9, color="#343a40")
            ax.set_ylabel(ylabel, fontsize=8)
        axes[-1].set_xlabel("Time", fontsize=9)
        axes[-1].xaxis.set_major_locator(mdates.AutoDateLocator(minticks=5, maxticks=9))
        axes[-1].xaxis.set_major_formatter(mdates.ConciseDateFormatter(axes[-1].xaxis.get_major_locator()))
        fig.suptitle("Spacecraft Cabin Environmental Conditions", fontsize=12, color="#252a2e")
        fig.tight_layout(rect=(0, 0, 1, 0.975))
        fig.savefig(environment_path, dpi=110, facecolor=fig.get_facecolor())
    finally:
        plt.close(fig)
    created.append(environment_path)

    if len(created) != 12:
        raise RuntimeError(f"Expected 12 visualizations, generated {len(created)}.")
    return created


def generate_dataset(
    output_folder: Path,
    mission_days: float = 21,
    sample_interval_seconds: int = 5,
    seed: int = 2026,
) -> dict[str, Any]:
    if not math.isfinite(mission_days) or mission_days <= 0:
        raise ValueError("Mission duration must be greater than zero.")
    if sample_interval_seconds <= 0:
        raise ValueError("Sample interval must be greater than zero.")

    sample_count = max(1, int(round(mission_days * SECONDS_PER_DAY / sample_interval_seconds)))
    environment_data = generate_environment_data(
        sample_count,
        sample_interval_seconds=sample_interval_seconds,
        seed=seed,
    )
    timestamps = pd.DatetimeIndex(environment_data["timestamp"])
    sensor_data = build_dataframe_for_all_astronauts(
        ASTRONAUT_PROFILES,
        timestamps,
        sample_interval_seconds=sample_interval_seconds,
        seed=seed,
    )
    alerts = add_anomaly_alert_events(sensor_data)
    profile_data = pd.DataFrame(ASTRONAUT_PROFILES)
    csv_paths = save_csv_files(
        profile_data,
        sensor_data,
        alerts,
        environment_data,
        output_folder,
        mission_days=mission_days,
        sample_interval_seconds=sample_interval_seconds,
    )
    visualization_paths = create_full_visualizations(
        sensor_data,
        environment_data,
        output_folder / "visualizations",
        sample_interval_seconds=sample_interval_seconds,
    )
    return {
        "sample_count_per_astronaut": sample_count,
        "sensor_rows": len(sensor_data),
        "environment_rows": len(environment_data),
        "alert_rows": len(alerts),
        "csv_paths": csv_paths,
        "visualization_paths": visualization_paths,
    }


def main() -> None:
    default_output = Path(__file__).resolve().parent / "AI_SPACE_GUARDIAN_DATA"
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-folder", type=Path, default=default_output)
    parser.add_argument("--days", type=float, default=21)
    parser.add_argument("--sample-interval-seconds", type=int, default=5)
    parser.add_argument("--seed", type=int, default=2026)
    args = parser.parse_args()

    result = generate_dataset(
        args.output_folder,
        mission_days=args.days,
        sample_interval_seconds=args.sample_interval_seconds,
        seed=args.seed,
    )
    print(f"Generated {result['sensor_rows']:,} synthetic astronaut sensor rows.")
    print(f"Generated {result['environment_rows']:,} shared cabin environment rows.")
    print(f"Generated {result['alert_rows']:,} synthetic anomaly alert rows.")
    print(f"CSV output: {args.output_folder.resolve()}")
    print(f"Visualizations: {args.output_folder.resolve() / 'visualizations'} (12 PNG files)")


if __name__ == "__main__":
    main()
