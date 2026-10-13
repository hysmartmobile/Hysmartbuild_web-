const MODEL_TYPE = 'SCHEDULE_DELAY_LOGISTIC_V1';
const MODEL_VERSION = 1;
const MIN_TRAINING_ROWS = 20;
const MIN_PER_CLASS = 4;
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const sigmoid = z => 1 / (1 + Math.exp(-clamp(z, -30, 30)));
const dayDiff = (start, finish) => Math.max(0, Math.round((new Date(`${finish}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000));

export function scheduleFeatures(row) {
  const duration = Number(row.calendar_days ?? dayDiff(row.planned_start, row.planned_finish));
  return [
    clamp(Math.log1p(Math.max(0, duration)) / Math.log(366), 0, 1.5),
    row.is_critical ? 1 : 0,
    clamp(Number(row.total_float_days ?? 0), -30, 90) / 90,
    row.activity_type === 'MILESTONE' ? 1 : 0
  ];
}

export function trainLogistic(rows, epochs = 1400, learningRate = 0.08) {
  const dimensions = rows[0].x.length;
  const weights = Array(dimensions + 1).fill(0);
  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradients = Array(dimensions + 1).fill(0);
    for (const row of rows) {
      const z = weights[0] + row.x.reduce((sum, x, i) => sum + x * weights[i + 1], 0);
      const error = sigmoid(z) - row.y;
      gradients[0] += error;
      row.x.forEach((x, i) => { gradients[i + 1] += error * x; });
    }
    const rate = learningRate / rows.length;
    weights.forEach((weight, i) => { weights[i] = weight - rate * (gradients[i] + (i === 0 ? 0 : 0.01 * weight)); });
  }
  return weights;
}

export function score(weights, x) { return sigmoid(weights[0] + x.reduce((sum, value, i) => sum + value * weights[i + 1], 0)); }

export function evaluate(weights, rows) {
  let correct = 0, tp = 0, fp = 0, fn = 0, brier = 0;
  for (const row of rows) {
    const probability = score(weights, row.x);
    const predicted = probability >= 0.5 ? 1 : 0;
    if (predicted === row.y) correct++;
    if (predicted && row.y) tp++;
    if (predicted && !row.y) fp++;
    if (!predicted && row.y) fn++;
    brier += (probability - row.y) ** 2;
  }
  return { sampleCount: rows.length, accuracy: round(correct / rows.length), precision: round(tp / Math.max(1, tp + fp)), recall: round(tp / Math.max(1, tp + fn)), brierScore: round(brier / rows.length), threshold: 0.5 };
}
const round = value => Number(value.toFixed(4));

export class ScheduleForecastService {
  constructor({ supabase }) { this.supabase = supabase; }

  async trainProject({ companyId, projectId, userId = null }) {
    const { data: project, error: projectError } = await this.supabase.from('projects').select('id,company_id,name').eq('company_id', companyId).eq('id', projectId).maybeSingle();
    if (projectError) throw projectError;
    if (!project) throw Object.assign(new Error('Project not found'), { status: 404 });
    const { data: activities, error } = await this.supabase.from('project_schedule_activities')
      .select('id,company_id,project_id,name,activity_type,calendar_days,planned_start,planned_finish,actual_start,actual_finish,status,percent_complete,is_critical,total_float_days,delay_days')
      .eq('company_id', companyId).eq('project_id', projectId).eq('status', 'COMPLETED').not('actual_finish', 'is', null)
      .order('actual_finish', { ascending: true }).limit(5000);
    if (error) throw error;
    const rows = (activities || []).filter(row => row.activity_type !== 'SUMMARY').map(row => ({ id: row.id, x: scheduleFeatures(row), y: new Date(`${row.actual_finish}T00:00:00Z`) > new Date(`${row.planned_finish}T00:00:00Z`) ? 1 : 0, actualFinish: row.actual_finish }));
    const classCounts = { delayed: rows.filter(row => row.y === 1).length, onTime: rows.filter(row => row.y === 0).length };
    const now = new Date().toISOString();
    if (rows.length < MIN_TRAINING_ROWS || Math.min(classCounts.delayed, classCounts.onTime) < MIN_PER_CLASS) {
      const { data: model, error: saveError } = await this.supabase.from('hysmart_forecast_models').insert({ company_id: companyId, project_id: projectId, model_type: MODEL_TYPE, model_version: MODEL_VERSION, status: 'INSUFFICIENT_DATA', training_sample_count: rows.length, class_counts: classCounts, evaluation_metrics: {}, parameters: {}, trained_at: now, trained_by: userId }).select('id,status,training_sample_count,class_counts,evaluation_metrics,trained_at').single();
      if (saveError) throw saveError;
      return { model, message: `More completed schedule history is required. At least ${MIN_TRAINING_ROWS} completed activities and ${MIN_PER_CLASS} examples in each outcome class are required.`, predictionsCreated: 0 };
    }

    // A chronological holdout estimates generalisation on later completed activities.
    const splitAt = Math.max(1, Math.floor(rows.length * 0.8));
    const trainRows = rows.slice(0, splitAt), testRows = rows.slice(splitAt);
    const holdoutMetrics = testRows.length ? evaluate(trainLogistic(trainRows), testRows) : { sampleCount: 0, accuracy: null, precision: null, recall: null, brierScore: null, threshold: 0.5 };
    const finalWeights = trainLogistic(rows);
    const { data: model, error: modelError } = await this.supabase.from('hysmart_forecast_models').insert({
      company_id: companyId, project_id: projectId, model_type: MODEL_TYPE, model_version: MODEL_VERSION, status: 'READY',
      training_sample_count: rows.length, class_counts: classCounts, evaluation_metrics: { chronologicalHoldout: holdoutMetrics, holdoutStart: testRows[0]?.actualFinish || null, evaluationNote: 'Chronological holdout; metrics are descriptive and require ongoing monitoring.' },
      parameters: { weights: finalWeights, featureNames: ['log_duration_scaled', 'critical', 'total_float_scaled', 'milestone'], threshold: 0.5 }, trained_at: now, trained_by: userId
    }).select('id,status,training_sample_count,class_counts,evaluation_metrics,trained_at').single();
    if (modelError) throw modelError;

    const { data: openActivities, error: openError } = await this.supabase.from('project_schedule_activities')
      .select('id,name,activity_type,calendar_days,planned_start,planned_finish,status,percent_complete,is_critical,total_float_days,forecast_finish,delay_days')
      .eq('company_id', companyId).eq('project_id', projectId).in('status', ['NOT_STARTED','IN_PROGRESS','ON_HOLD']).neq('activity_type', 'SUMMARY').limit(3000);
    if (openError) throw openError;
    const predictions = (openActivities || []).map(activity => {
      const probability = round(score(finalWeights, scheduleFeatures(activity)));
      const factors = [];
      if (activity.is_critical) factors.push('critical path');
      if (Number(activity.total_float_days ?? 0) <= 0) factors.push('no schedule float');
      if (Number(activity.calendar_days ?? 0) >= 30) factors.push('long planned duration');
      return { company_id: companyId, project_id: projectId, model_id: model.id, activity_id: activity.id, activity_name: activity.name, delay_probability: probability, risk_level: probability >= 0.7 ? 'HIGH' : probability >= 0.4 ? 'MEDIUM' : 'LOW', features: { critical: Boolean(activity.is_critical), totalFloatDays: activity.total_float_days ?? null, plannedDurationDays: activity.calendar_days ?? null }, explanation: factors.length ? `Risk factors: ${factors.join(', ')}.` : 'Risk estimate based on historical schedule outcomes and current activity attributes.', generated_at: now };
    });
    if (predictions.length) {
      const { error: insertError } = await this.supabase.from('hysmart_forecast_predictions').insert(predictions);
      if (insertError) throw insertError;
    }
    // Keep the previous successful forecast until the new model's predictions are saved.
    const { error: deleteError } = await this.supabase.from('hysmart_forecast_predictions').delete()
      .eq('company_id', companyId).eq('project_id', projectId).neq('model_id', model.id);
    if (deleteError) throw deleteError;
    return { model, predictionsCreated: predictions.length, message: 'Schedule-delay model trained and chronological holdout evaluated. Human review is required.' };
  }

  async getProjectForecast({ companyId, projectId }) {
    const { data: model, error } = await this.supabase.from('hysmart_forecast_models').select('id,model_type,model_version,status,training_sample_count,class_counts,evaluation_metrics,trained_at').eq('company_id', companyId).eq('project_id', projectId).eq('model_type', MODEL_TYPE).order('trained_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (!model) return { model: null, predictions: [], ready: false };
    if (model.status !== 'READY') return { model, predictions: [], ready: false };
    const { data: predictions, error: predictionError } = await this.supabase.from('hysmart_forecast_predictions').select('activity_id,activity_name,delay_probability,risk_level,features,explanation,generated_at').eq('company_id', companyId).eq('project_id', projectId).eq('model_id', model.id).order('delay_probability', { ascending: false }).limit(30);
    if (predictionError) throw predictionError;
    return { model, predictions: predictions || [], ready: true };
  }
}
