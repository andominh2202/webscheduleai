package com.webschedule.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.webkit.CookieManager;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ScheduleWidgetProvider extends AppWidgetProvider {

    private static final String ACTION_REFRESH = "com.webschedule.app.ACTION_WIDGET_REFRESH";
    private static final String BASE_URL = "https://webscheduleai.vercel.app";
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidgetAsync(context, appWidgetManager, appWidgetId);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) {
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            ComponentName component = new ComponentName(context, ScheduleWidgetProvider.class);
            int[] ids = manager.getAppWidgetIds(component);
            for (int id : ids) {
                updateWidgetAsync(context, manager, id);
            }
        }
    }

    private static PendingIntent buildOpenAppIntent(Context context) {
        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
            context,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static PendingIntent buildRefreshIntent(Context context) {
        Intent refreshIntent = new Intent(context, ScheduleWidgetProvider.class);
        refreshIntent.setAction(ACTION_REFRESH);
        return PendingIntent.getBroadcast(
            context,
            1,
            refreshIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static void updateWidgetAsync(Context context, AppWidgetManager manager, int appWidgetId) {
        RemoteViews loadingViews = new RemoteViews(context.getPackageName(), R.layout.widget_schedule);
        loadingViews.setOnClickPendingIntent(R.id.widget_root, buildOpenAppIntent(context));
        loadingViews.setOnClickPendingIntent(R.id.widget_refresh, buildRefreshIntent(context));
        loadingViews.setTextViewText(R.id.widget_body, "Đang cập nhật lịch học...");
        manager.updateAppWidget(appWidgetId, loadingViews);

        EXECUTOR.execute(() -> {
            String subtitle = "Lịch học hôm nay";
            String body;
            String footer = "Chạm để mở WebSchedule";

            try {
                String cookies = "";
                try {
                    cookies = CookieManager.getInstance().getCookie(BASE_URL);
                } catch (Exception ignored) {
                    cookies = "";
                }

                if (cookies == null || cookies.trim().isEmpty()) {
                    body = "Chưa đăng nhập.\nMở ứng dụng WebSchedule để đăng nhập và đồng bộ lịch học.";
                } else {
                    URL url = new URL(BASE_URL + "/api/widget");
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("GET");
                    conn.setConnectTimeout(10000);
                    conn.setReadTimeout(10000);
                    conn.setRequestProperty("Cookie", cookies);
                    conn.setRequestProperty("Accept", "application/json");

                    int status = conn.getResponseCode();
                    if (status == 401) {
                        body = "Phiên đăng nhập đã hết hạn.\nChạm để mở WebSchedule và đăng nhập lại.";
                    } else if (status >= 200 && status < 300) {
                        StringBuilder sb = new StringBuilder();
                        try (BufferedReader reader = new BufferedReader(
                                new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                            String line;
                            while ((line = reader.readLine()) != null) {
                                sb.append(line);
                            }
                        }

                        JSONObject json = new JSONObject(sb.toString());
                        String today = json.optString("today", "");
                        if (today.length() == 10) {
                            subtitle = "Hôm nay · " + today.substring(8, 10) + "/" + today.substring(5, 7) + "/" + today.substring(0, 4);
                        }

                        JSONArray todaySessions = json.optJSONArray("todaySessions");
                        if (todaySessions != null && todaySessions.length() > 0) {
                            StringBuilder lines = new StringBuilder();
                            int max = Math.min(todaySessions.length(), 4);
                            for (int i = 0; i < max; i++) {
                                JSONObject s = todaySessions.getJSONObject(i);
                                String start = s.optString("startTime", "");
                                String end = s.optString("endTime", "");
                                String room = s.optString("room", "");
                                JSONObject course = s.optJSONObject("course");
                                String courseName = course != null ? course.optString("name", "Buổi học") : "Buổi học";

                                if (i > 0) lines.append("\n");
                                lines.append("• ").append(start).append("-").append(end).append("  ").append(courseName);
                                if (room != null && !room.isEmpty() && !"null".equals(room)) {
                                    lines.append(" (P.").append(room).append(")");
                                }
                            }
                            if (todaySessions.length() > max) {
                                lines.append("\n+ ").append(todaySessions.length() - max).append(" buổi khác...");
                            }
                            body = lines.toString();
                        } else {
                            JSONObject nextSession = json.optJSONObject("nextSession");
                            if (nextSession != null) {
                                JSONObject course = nextSession.optJSONObject("course");
                                String courseName = course != null ? course.optString("name", "Buổi học") : "Buổi học";
                                String start = nextSession.optString("startTime", "");
                                String end = nextSession.optString("endTime", "");
                                body = "Hôm nay trống lịch học.\nBuổi tiếp theo: " + courseName + " (" + start + "-" + end + ")";
                            } else {
                                body = "Hôm nay bạn không có lịch học nào.";
                            }
                        }

                        JSONArray assignments = json.optJSONArray("pendingAssignments");
                        int pendingCount = assignments != null ? assignments.length() : 0;
                        if (pendingCount > 0) {
                            footer = pendingCount + " bài tập sắp đến hạn · Chạm để xem";
                        }
                    } else {
                        body = "Không thể tải lịch (HTTP " + status + ").\nNhấn Làm mới để thử lại.";
                    }
                    conn.disconnect();
                }
            } catch (Exception e) {
                body = "Không có kết nối mạng.\nNhấn Làm mới khi có mạng.";
            }

            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_schedule);
            views.setOnClickPendingIntent(R.id.widget_root, buildOpenAppIntent(context));
            views.setOnClickPendingIntent(R.id.widget_refresh, buildRefreshIntent(context));
            views.setTextViewText(R.id.widget_subtitle, subtitle);
            views.setTextViewText(R.id.widget_body, body);
            views.setTextViewText(R.id.widget_footer, footer);
            manager.updateAppWidget(appWidgetId, views);
        });
    }
}
