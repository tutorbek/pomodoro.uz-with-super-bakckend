package uz.pomodoro;

import org.junit.jupiter.api.Test;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

public class QueryTest {

    @Test
    public void queryTables() throws Exception {
        String url = "jdbc:postgresql://localhost:26257/pomodoro?sslmode=disable";
        try (Connection conn = DriverManager.getConnection(url, "root", "")) {
            try (Statement stmt = conn.createStatement()) {
                System.out.println("=== USERS ===");
                ResultSet rs1 = stmt.executeQuery("SELECT id, telegram_id, username, first_name FROM users;");
                while (rs1.next()) {
                    System.out.println("User: " + rs1.getString("id") + " | tg: " + rs1.getObject("telegram_id") + " | " + rs1.getString("username"));
                }

                System.out.println("=== SESSIONS ===");
                ResultSet rs2 = stmt.executeQuery("SELECT id, user_id, duration, label, completed, started_at, ended_at FROM pomodoro_sessions;");
                while (rs2.next()) {
                    System.out.println("Session: " + rs2.getString("id") + " | user: " + rs2.getString("user_id") + " | dur: " + rs2.getInt("duration") + " | completed: " + rs2.getBoolean("completed") + " | label: " + rs2.getString("label") + " | started: " + rs2.getTimestamp("started_at"));
                }
            }
        }
    }
}
